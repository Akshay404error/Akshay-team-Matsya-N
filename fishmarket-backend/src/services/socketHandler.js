const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const logger = require('../config/logger');

// Store connected users
const connectedUsers = new Map();
const auctionRooms = new Map();

const socketHandler = (io) => {
  // Authentication middleware for socket connections
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Verify user exists and is active
      const userResult = await query(
        'SELECT id, email, first_name, last_name, role, is_active FROM users WHERE id = $1',
        [decoded.userId]
      );

      if (userResult.rows.length === 0 || !userResult.rows[0].is_active) {
        return next(new Error('Authentication error: User not found or inactive'));
      }

      socket.user = userResult.rows[0];
      next();
    } catch (error) {
      logger.error('Socket authentication error:', error);
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    logger.info(`User connected: ${socket.user.email} (${socket.id})`);
    
    // Store user connection
    connectedUsers.set(socket.user.id, {
      socketId: socket.id,
      user: socket.user,
      connectedAt: new Date()
    });

    // Join user to their personal room for notifications
    socket.join(`user:${socket.user.id}`);

    // Send connection confirmation
    socket.emit('connected', {
      message: 'Connected successfully',
      user: {
        id: socket.user.id,
        email: socket.user.email,
        name: `${socket.user.first_name} ${socket.user.last_name}`,
        role: socket.user.role
      }
    });

    // Handle joining auction rooms
    socket.on('join-auction', async (data) => {
      try {
        const { auctionId } = data;
        
        // Verify auction exists and is active
        const auctionResult = await query(
          'SELECT id, status, start_time, end_time FROM auctions WHERE id = $1',
          [auctionId]
        );

        if (auctionResult.rows.length === 0) {
          socket.emit('error', { message: 'Auction not found' });
          return;
        }

        const auction = auctionResult.rows[0];
        const now = new Date();

        if (auction.status !== 'active' || now < auction.start_time || now > auction.end_time) {
          socket.emit('error', { message: 'Auction is not currently active' });
          return;
        }

        // Join auction room
        socket.join(`auction:${auctionId}`);
        
        // Track auction room participants
        if (!auctionRooms.has(auctionId)) {
          auctionRooms.set(auctionId, new Set());
        }
        auctionRooms.get(auctionId).add(socket.user.id);

        // Get current auction state
        const bidsResult = await query(`
          SELECT b.amount, b.placed_at, u.first_name, u.last_name
          FROM bids b
          JOIN users u ON b.bidder_id = u.id
          WHERE b.auction_id = $1 AND b.status = 'active'
          ORDER BY b.amount DESC, b.placed_at ASC
          LIMIT 1
        `, [auctionId]);

        const currentBid = bidsResult.rows.length > 0 ? bidsResult.rows[0] : null;

        socket.emit('auction-joined', {
          auctionId,
          currentBid: currentBid ? {
            amount: parseFloat(currentBid.amount),
            placedAt: currentBid.placed_at,
            bidderName: `${currentBid.first_name} ${currentBid.last_name}`
          } : null,
          participantCount: auctionRooms.get(auctionId).size
        });

        // Notify others in the auction room
        socket.to(`auction:${auctionId}`).emit('user-joined-auction', {
          userId: socket.user.id,
          userName: `${socket.user.first_name} ${socket.user.last_name}`,
          participantCount: auctionRooms.get(auctionId).size
        });

        logger.info(`User ${socket.user.email} joined auction ${auctionId}`);
      } catch (error) {
        logger.error('Error joining auction:', error);
        socket.emit('error', { message: 'Failed to join auction' });
      }
    });

    // Handle leaving auction rooms
    socket.on('leave-auction', (data) => {
      try {
        const { auctionId } = data;
        socket.leave(`auction:${auctionId}`);
        
        // Remove from auction room tracking
        if (auctionRooms.has(auctionId)) {
          auctionRooms.get(auctionId).delete(socket.user.id);
          
          if (auctionRooms.get(auctionId).size === 0) {
            auctionRooms.delete(auctionId);
          } else {
            // Notify others in the auction room
            socket.to(`auction:${auctionId}`).emit('user-left-auction', {
              userId: socket.user.id,
              userName: `${socket.user.first_name} ${socket.user.last_name}`,
              participantCount: auctionRooms.get(auctionId).size
            });
          }
        }

        socket.emit('auction-left', { auctionId });
        logger.info(`User ${socket.user.email} left auction ${auctionId}`);
      } catch (error) {
        logger.error('Error leaving auction:', error);
        socket.emit('error', { message: 'Failed to leave auction' });
      }
    });

    // Handle placing bids
    socket.on('place-bid', async (data) => {
      try {
        const { auctionId, amount } = data;

        // Validate bid amount
        if (!amount || amount <= 0) {
          socket.emit('bid-error', { message: 'Invalid bid amount' });
          return;
        }

        // Get auction details
        const auctionResult = await query(`
          SELECT a.*, f.fisherman_id
          FROM auctions a
          JOIN fish f ON a.fish_id = f.id
          WHERE a.id = $1
        `, [auctionId]);

        if (auctionResult.rows.length === 0) {
          socket.emit('bid-error', { message: 'Auction not found' });
          return;
        }

        const auction = auctionResult.rows[0];
        const now = new Date();

        // Validation checks
        if (auction.status !== 'active') {
          socket.emit('bid-error', { message: 'Auction is not active' });
          return;
        }

        if (now < auction.start_time || now > auction.end_time) {
          socket.emit('bid-error', { message: 'Auction is not currently running' });
          return;
        }

        if (socket.user.id === auction.fisherman_id) {
          socket.emit('bid-error', { message: 'Cannot bid on your own fish' });
          return;
        }

        if (amount < auction.current_price + auction.bid_increment) {
          socket.emit('bid-error', { 
            message: `Bid must be at least ${auction.current_price + auction.bid_increment}` 
          });
          return;
        }

        // Check if user has a higher bid already
        const existingBidResult = await query(`
          SELECT amount FROM bids 
          WHERE auction_id = $1 AND bidder_id = $2 AND status = 'active'
          ORDER BY amount DESC LIMIT 1
        `, [auctionId, socket.user.id]);

        if (existingBidResult.rows.length > 0 && 
            parseFloat(existingBidResult.rows[0].amount) >= amount) {
          socket.emit('bid-error', { 
            message: 'You already have a higher or equal bid' 
          });
          return;
        }

        // Place the bid
        const bidResult = await query(`
          INSERT INTO bids (auction_id, bidder_id, amount, placed_at)
          VALUES ($1, $2, $3, NOW())
          RETURNING id, amount, placed_at
        `, [auctionId, socket.user.id, amount]);

        const bid = bidResult.rows[0];

        // Emit bid placed to the bidder
        socket.emit('bid-placed', {
          bidId: bid.id,
          auctionId,
          amount: parseFloat(bid.amount),
          placedAt: bid.placed_at
        });

        // Emit new bid to all participants in the auction
        io.to(`auction:${auctionId}`).emit('new-bid', {
          auctionId,
          amount: parseFloat(bid.amount),
          bidderName: `${socket.user.first_name} ${socket.user.last_name}`,
          bidderId: socket.user.id,
          placedAt: bid.placed_at
        });

        // Send notification to outbid users
        const outbidUsers = await query(`
          SELECT DISTINCT u.id, u.first_name, u.last_name
          FROM bids b
          JOIN users u ON b.bidder_id = u.id
          WHERE b.auction_id = $1 AND b.bidder_id != $2 AND b.status = 'outbid'
        `, [auctionId, socket.user.id]);

        outbidUsers.rows.forEach(user => {
          io.to(`user:${user.id}`).emit('outbid-notification', {
            auctionId,
            newBidAmount: parseFloat(bid.amount),
            message: `You have been outbid on auction ${auctionId}`
          });
        });

        logger.info(`Bid placed: ${amount} by ${socket.user.email} on auction ${auctionId}`);
      } catch (error) {
        logger.error('Error placing bid:', error);
        socket.emit('bid-error', { message: 'Failed to place bid' });
      }
    });

    // Handle auction watching
    socket.on('watch-auction', async (data) => {
      try {
        const { auctionId } = data;
        
        // Add to watchers table
        await query(`
          INSERT INTO auction_watchers (user_id, auction_id)
          VALUES ($1, $2)
          ON CONFLICT (user_id, auction_id) DO NOTHING
        `, [socket.user.id, auctionId]);

        socket.emit('auction-watched', { auctionId });
        logger.info(`User ${socket.user.email} is now watching auction ${auctionId}`);
      } catch (error) {
        logger.error('Error watching auction:', error);
        socket.emit('error', { message: 'Failed to watch auction' });
      }
    });

    // Handle auction unwatching
    socket.on('unwatch-auction', async (data) => {
      try {
        const { auctionId } = data;
        
        await query(`
          DELETE FROM auction_watchers 
          WHERE user_id = $1 AND auction_id = $2
        `, [socket.user.id, auctionId]);

        socket.emit('auction-unwatched', { auctionId });
        logger.info(`User ${socket.user.email} stopped watching auction ${auctionId}`);
      } catch (error) {
        logger.error('Error unwatching auction:', error);
        socket.emit('error', { message: 'Failed to unwatch auction' });
      }
    });

    // Handle typing indicators for chat
    socket.on('typing-start', (data) => {
      const { auctionId } = data;
      socket.to(`auction:${auctionId}`).emit('user-typing', {
        userId: socket.user.id,
        userName: `${socket.user.first_name} ${socket.user.last_name}`
      });
    });

    socket.on('typing-stop', (data) => {
      const { auctionId } = data;
      socket.to(`auction:${auctionId}`).emit('user-stopped-typing', {
        userId: socket.user.id
      });
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      logger.info(`User disconnected: ${socket.user.email} (${socket.id}) - Reason: ${reason}`);
      
      // Remove from connected users
      connectedUsers.delete(socket.user.id);
      
      // Remove from all auction rooms
      auctionRooms.forEach((participants, auctionId) => {
        if (participants.has(socket.user.id)) {
          participants.delete(socket.user.id);
          
          if (participants.size === 0) {
            auctionRooms.delete(auctionId);
          } else {
            // Notify others in auction rooms
            socket.to(`auction:${auctionId}`).emit('user-left-auction', {
              userId: socket.user.id,
              userName: `${socket.user.first_name} ${socket.user.last_name}`,
              participantCount: participants.size
            });
          }
        }
      });
    });

    // Handle errors
    socket.on('error', (error) => {
      logger.error(`Socket error for user ${socket.user.email}:`, error);
    });
  });
};

// Helper functions to emit events from other parts of the application
const emitToUser = (userId, event, data) => {
  const io = require('../app').io;
  io.to(`user:${userId}`).emit(event, data);
};

const emitToAuction = (auctionId, event, data) => {
  const io = require('../app').io;
  io.to(`auction:${auctionId}`).emit(event, data);
};

const getConnectedUsers = () => {
  return Array.from(connectedUsers.values());
};

const getAuctionParticipants = (auctionId) => {
  return auctionRooms.get(auctionId) || new Set();
};

module.exports = {
  socketHandler,
  emitToUser,
  emitToAuction,
  getConnectedUsers,
  getAuctionParticipants
};