const { query, transaction } = require('../config/database');
const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');

class User {
  constructor(userData) {
    this.id = userData.id;
    this.role = userData.role;
    this.name = userData.name;
    this.phone = userData.phone;
    this.email = userData.email;
    this.kycStatus = userData.kyc_status;
    this.societyId = userData.society_id;
    this.isActive = userData.is_active;
    this.createdAt = userData.created_at;
    this.updatedAt = userData.updated_at;
  }

  // User roles enum
  static ROLES = {
    FISHER: 'fisher',
    SOCIETY_ADMIN: 'society_admin', 
    BUYER: 'buyer',
    DELIVERY_PARTNER: 'delivery_partner',
    SUPER_ADMIN: 'super_admin'
  };

  // KYC status enum
  static KYC_STATUS = {
    PENDING: 'pending',
    UNDER_REVIEW: 'under_review',
    APPROVED: 'approved',
    REJECTED: 'rejected'
  };

  // Create new user
  static async create(userData) {
    try {
      const {
        role,
        name,
        phone,
        email,
        password,
        society_id = null
      } = userData;

      // Hash password if provided
      let hashedPassword = null;
      if (password) {
        const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;
        hashedPassword = await bcrypt.hash(password, saltRounds);
      }

      const insertQuery = `
        INSERT INTO users (role, name, phone, email, password_hash, society_id, kyc_status, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, role, name, phone, email, kyc_status, society_id, is_active, created_at, updated_at
      `;

      const values = [
        role,
        name,
        phone,
        email,
        hashedPassword,
        society_id,
        User.KYC_STATUS.PENDING,
        true
      ];

      const result = await query(insertQuery, values);
      return new User(result.rows[0]);
    } catch (error) {
      logger.error('User creation error:', error);
      throw error;
    }
  }

  // Find user by ID
  static async findById(id) {
    try {
      const selectQuery = `
        SELECT id, role, name, phone, email, kyc_status, society_id, is_active, created_at, updated_at
        FROM users 
        WHERE id = $1 AND is_active = true
      `;
      
      const result = await query(selectQuery, [id]);
      return result.rows.length > 0 ? new User(result.rows[0]) : null;
    } catch (error) {
      logger.error('Find user by ID error:', error);
      throw error;
    }
  }

  // Find user by phone
  static async findByPhone(phone) {
    try {
      const selectQuery = `
        SELECT id, role, name, phone, email, kyc_status, society_id, is_active, created_at, updated_at
        FROM users 
        WHERE phone = $1 AND is_active = true
      `;
      
      const result = await query(selectQuery, [phone]);
      return result.rows.length > 0 ? new User(result.rows[0]) : null;
    } catch (error) {
      logger.error('Find user by phone error:', error);
      throw error;
    }
  }

  // Find user by email
  static async findByEmail(email) {
    try {
      const selectQuery = `
        SELECT id, role, name, phone, email, kyc_status, society_id, is_active, created_at, updated_at
        FROM users 
        WHERE email = $1 AND is_active = true
      `;
      
      const result = await query(selectQuery, [email]);
      return result.rows.length > 0 ? new User(result.rows[0]) : null;
    } catch (error) {
      logger.error('Find user by email error:', error);
      throw error;
    }
  }

  // Verify password
  static async verifyPassword(userId, password) {
    try {
      const selectQuery = `
        SELECT password_hash FROM users WHERE id = $1 AND is_active = true
      `;
      
      const result = await query(selectQuery, [userId]);
      if (result.rows.length === 0) {
        return false;
      }

      const { password_hash } = result.rows[0];
      return await bcrypt.compare(password, password_hash);
    } catch (error) {
      logger.error('Password verification error:', error);
      return false;
    }
  }

  // Update user
  static async update(id, updateData) {
    try {
      const allowedFields = ['name', 'email', 'kyc_status', 'society_id'];
      const updateFields = [];
      const values = [];
      let paramCounter = 1;

      for (const [key, value] of Object.entries(updateData)) {
        if (allowedFields.includes(key)) {
          updateFields.push(`${key} = ${paramCounter}`);
          values.push(value);
          paramCounter++;
        }
      }

      if (updateFields.length === 0) {
        throw new Error('No valid fields to update');
      }

      updateFields.push(`updated_at = NOW()`);
      values.push(id);

      const updateQuery = `
        UPDATE users 
        SET ${updateFields.join(', ')}
        WHERE id = ${paramCounter} AND is_active = true
        RETURNING id, role, name, phone, email, kyc_status, society_id, is_active, created_at, updated_at
      `;

      const result = await query(updateQuery, values);
      return result.rows.length > 0 ? new User(result.rows[0]) : null;
    } catch (error) {
      logger.error('User update error:', error);
      throw error;
    }
  }

  // Update password
  static async updatePassword(id, newPassword) {
    try {
      const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

      const updateQuery = `
        UPDATE users 
        SET password_hash = $1, updated_at = NOW()
        WHERE id = $2 AND is_active = true
        RETURNING id
      `;

      const result = await query(updateQuery, [hashedPassword, id]);
      return result.rows.length > 0;
    } catch (error) {
      logger.error('Password update error:', error);
      throw error;
    }
  }

  // Get users by role
  static async findByRole(role, limit = 50, offset = 0) {
    try {
      const selectQuery = `
        SELECT id, role, name, phone, email, kyc_status, society_id, is_active, created_at, updated_at
        FROM users 
        WHERE role = $1 AND is_active = true
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
      `;
      
      const result = await query(selectQuery, [role, limit, offset]);
      return result.rows.map(row => new User(row));
    } catch (error) {
      logger.error('Find users by role error:', error);
      throw error;
    }
  }

  // Get users by society
  static async findBySociety(societyId, limit = 50, offset = 0) {
    try {
      const selectQuery = `
        SELECT id, role, name, phone, email, kyc_status, society_id, is_active, created_at, updated_at
        FROM users 
        WHERE society_id = $1 AND is_active = true
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
      `;
      
      const result = await query(selectQuery, [societyId, limit, offset]);
      return result.rows.map(row => new User(row));
    } catch (error) {
      logger.error('Find users by society error:', error);
      throw error;
    }
  }

  // Soft delete user
  static async softDelete(id) {
    try {
      const updateQuery = `
        UPDATE users 
        SET is_active = false, updated_at = NOW()
        WHERE id = $1
        RETURNING id
      `;

      const result = await query(updateQuery, [id]);
      return result.rows.length > 0;
    } catch (error) {
      logger.error('User soft delete error:', error);
      throw error;
    }
  }

  // Update KYC status
  static async updateKycStatus(id, status, notes = null) {
    try {
      return await transaction(async (client) => {
        // Update user KYC status
        const updateQuery = `
          UPDATE users 
          SET kyc_status = $1, updated_at = NOW()
          WHERE id = $2 AND is_active = true
          RETURNING id, role, name, phone, email, kyc_status, society_id, is_active, created_at, updated_at
        `;

        const result = await client.query(updateQuery, [status, id]);
        
        if (result.rows.length === 0) {
          throw new Error('User not found');
        }

        // Log KYC status change
        const auditQuery = `
          INSERT INTO audit_logs (actor_id, entity, entity_id, action, diff, created_at)
          VALUES ($1, 'user', $2, 'kyc_status_update', $3, NOW())
        `;

        const auditData = {
          old_status: 'unknown',
          new_status: status,
          notes: notes
        };

        await client.query(auditQuery, [id, id, JSON.stringify(auditData)]);

        return new User(result.rows[0]);
      });
    } catch (error) {
      logger.error('KYC status update error:', error);
      throw error;
    }
  }

  // Get user statistics
  static async getStatistics() {
    try {
      const statsQuery = `
        SELECT 
          role,
          kyc_status,
          COUNT(*) as count
        FROM users 
        WHERE is_active = true
        GROUP BY role, kyc_status
        ORDER BY role, kyc_status
      `;

      const result = await query(statsQuery);
      
      const stats = {
        total: 0,
        by_role: {},
        by_kyc_status: {}
      };

      result.rows.forEach(row => {
        stats.total += parseInt(row.count);
        
        if (!stats.by_role[row.role]) {
          stats.by_role[row.role] = 0;
        }
        stats.by_role[row.role] += parseInt(row.count);
        
        if (!stats.by_kyc_status[row.kyc_status]) {
          stats.by_kyc_status[row.kyc_status] = 0;
        }
        stats.by_kyc_status[row.kyc_status] += parseInt(row.count);
      });

      return stats;
    } catch (error) {
      logger.error('User statistics error:', error);
      throw error;
    }
  }

  // Instance methods
  toJSON() {
    return {
      id: this.id,
      role: this.role,
      name: this.name,
      phone: this.phone,
      email: this.email,
      kycStatus: this.kycStatus,
      societyId: this.societyId,
      isActive: this.isActive,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  // Check if user has specific role
  hasRole(role) {
    return this.role === role;
  }

  // Check if user KYC is approved
  isKycApproved() {
    return this.kycStatus === User.KYC_STATUS.APPROVED;
  }

  // Check if user belongs to a society
  hasSociety() {
    return this.societyId !== null;
  }
}

module.exports = User;