const { query, transaction, geoQuery } = require('../config/database');
const logger = require('../utils/logger');

class Catch {
  constructor(catchData) {
    this.id = catchData.id;
    this.fisherId = catchData.fisher_id;
    this.species = catchData.species;
    this.grade = catchData.grade;
    this.grossWeightKg = catchData.gross_weight_kg;
    this.mediaUrls = catchData.media_urls || [];
    this.landedAt = catchData.landed_at;
    this.latitude = catchData.latitude;
    this.longitude = catchData.longitude;
    this.coldChain = catchData.cold_chain || {};
    this.status = catchData.status;
    this.landingCenter = catchData.landing_center;
    this.boatId = catchData.boat_id;
    this.createdAt = catchData.created_at;
    this.updatedAt = catchData.updated_at;
  }

  // Catch status enum
  static STATUS = {
    LOGGED: 'logged',           // Fisher logged the catch
    QC_PENDING: 'qc_pending',   // Waiting for society QC
    QC_APPROVED: 'qc_approved', // Approved by society
    QC_REJECTED: 'qc_rejected', // Rejected by society
    LOTTED: 'lotted',          // Converted to auction lot
    SOLD: 'sold',              // Successfully sold
    EXPIRED: 'expired'         // Past freshness window
  };

  // Fish grades
  static GRADES = {
    PREMIUM: 'premium',
    GRADE_A: 'grade_a',
    GRADE_B: 'grade_b',
    GRADE_C: 'grade_c',
    MIXED: 'mixed'
  };

  // Common fish species (extendable)
  static SPECIES = {
    TUNA: 'tuna',
    SARDINE: 'sardine',
    MACKEREL: 'mackerel',
    POMFRET: 'pomfret',
    KINGFISH: 'kingfish',
    PRAWNS: 'prawns',
    CRAB: 'crab',
    LOBSTER: 'lobster',
    ANCHOVY: 'anchovy',
    HILSA: 'hilsa'
  };

  // Create new catch log
  static async create(catchData) {
    try {
      const {
        fisher_id,
        species,
        grade,
        gross_weight_kg,
        media_urls = [],
        landed_at,
        latitude,
        longitude,
        cold_chain = {},
        landing_center,
        boat_id
      } = catchData;

      const insertQuery = `
        INSERT INTO catches (
          fisher_id, species, grade, gross_weight_kg, media_urls,
          landed_at, geom, cold_chain, status, landing_center, boat_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, ST_SetSRID(ST_MakePoint($7, $8), 4326), $9, $10, $11, $12)
        RETURNING 
          id, fisher_id, species, grade, gross_weight_kg, media_urls,
          landed_at, ST_Y(geom) as latitude, ST_X(geom) as longitude,
          cold_chain, status, landing_center, boat_id, created_at, updated_at
      `;

      const values = [
        fisher_id,
        species,
        grade,
        parseFloat(gross_weight_kg),
        JSON.stringify(media_urls),
        landed_at || new Date(),
        parseFloat(longitude), // Note: PostGIS uses (lon, lat) order
        parseFloat(latitude),
        JSON.stringify(cold_chain),
        Catch.STATUS.LOGGED,
        landing_center,
        boat_id
      ];

      const result = await query(insertQuery, values);
      return new Catch(result.rows[0]);
    } catch (error) {
      logger.error('Catch creation error:', error);
      throw error;
    }
  }

  // Find catch by ID
  static async findById(id) {
    try {
      const selectQuery = `
        SELECT 
          id, fisher_id, species, grade, gross_weight_kg, media_urls,
          landed_at, ST_Y(geom) as latitude, ST_X(geom) as longitude,
          cold_chain, status, landing_center, boat_id, created_at, updated_at
        FROM catches 
        WHERE id = $1
      `;
      
      const result = await query(selectQuery, [id]);
      return result.rows.length > 0 ? new Catch(result.rows[0]) : null;
    } catch (error) {
      logger.error('Find catch by ID error:', error);
      throw error;
    }
  }

  // Get catches by fisher
  static async findByFisher(fisherId, limit = 50, offset = 0, status = null) {
    try {
      let whereClause = 'WHERE fisher_id = $1';
      const values = [fisherId];
      let paramCount = 1;

      if (status) {
        paramCount++;
        whereClause += ` AND status = $${paramCount}`;
        values.push(status);
      }

      paramCount++;
      const limitValue = paramCount;
      values.push(limit);
      
      paramCount++;
      const offsetValue = paramCount;
      values.push(offset);

      const selectQuery = `
        SELECT 
          id, fisher_id, species, grade, gross_weight_kg, media_urls,
          landed_at, ST_Y(geom) as latitude, ST_X(geom) as longitude,
          cold_chain, status, landing_center, boat_id, created_at, updated_at
        FROM catches 
        ${whereClause}
        ORDER BY landed_at DESC
        LIMIT $${limitValue} OFFSET $${offsetValue}
      `;
      
      const result = await query(selectQuery, values);
      return result.rows.map(row => new Catch(row));
    } catch (error) {
      logger.error('Find catches by fisher error:', error);
      throw error;
    }
  }

  // Get catches by location (within radius)
  static async findByLocation(latitude, longitude, radiusKm = 50, limit = 100, filters = {}) {
    try {
      let whereConditions = ['ST_DWithin(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3 * 1000)'];
      const values = [parseFloat(longitude), parseFloat(latitude), parseFloat(radiusKm)];
      let paramCount = 3;

      // Apply filters
      if (filters.species) {
        paramCount++;
        whereConditions.push(`species = $${paramCount}`);
        values.push(filters.species);
      }

      if (filters.grade) {
        paramCount++;
        whereConditions.push(`grade = $${paramCount}`);
        values.push(filters.grade);
      }

      if (filters.status) {
        paramCount++;
        whereConditions.push(`status = $${paramCount}`);
        values.push(filters.status);
      }

      if (filters.minWeight) {
        paramCount++;
        whereConditions.push(`gross_weight_kg >= $${paramCount}`);
        values.push(parseFloat(filters.minWeight));
      }

      if (filters.landedAfter) {
        paramCount++;
        whereConditions.push(`landed_at >= $${paramCount}`);
        values.push(filters.landedAfter);
      }

      paramCount++;
      values.push(limit);

      const selectQuery = `
        SELECT 
          id, fisher_id, species, grade, gross_weight_kg, media_urls,
          landed_at, ST_Y(geom) as latitude, ST_X(geom) as longitude,
          cold_chain, status, landing_center, boat_id, created_at, updated_at,
          ST_Distance(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) / 1000 as distance_km
        FROM catches 
        WHERE ${whereConditions.join(' AND ')}
        ORDER BY distance_km ASC, landed_at DESC
        LIMIT $${paramCount}
      `;
      
      const result = await query(selectQuery, values);
      return result.rows.map(row => {
        const catch_obj = new Catch(row);
        catch_obj.distanceKm = parseFloat(row.distance_km);
        return catch_obj;
      });
    } catch (error) {
      logger.error('Find catches by location error:', error);
      throw error;
    }
  }

  // Update catch status (for QC workflow)
  static async updateStatus(id, newStatus, updatedBy, notes = null) {
    try {
      return await transaction(async (client) => {
        // Get current catch details
        const currentQuery = `
          SELECT status, fisher_id FROM catches WHERE id = $1
        `;
        const currentResult = await client.query(currentQuery, [id]);
        
        if (currentResult.rows.length === 0) {
          throw new Error('Catch not found');
        }

        const oldStatus = currentResult.rows[0].status;
        const fisherId = currentResult.rows[0].fisher_id;

        // Update status
        const updateQuery = `
          UPDATE catches 
          SET status = $1, updated_at = NOW()
          WHERE id = $2
          RETURNING 
            id, fisher_id, species, grade, gross_weight_kg, media_urls,
            landed_at, ST_Y(geom) as latitude, ST_X(geom) as longitude,
            cold_chain, status, landing_center, boat_id, created_at, updated_at
        `;

        const result = await client.query(updateQuery, [newStatus, id]);

        // Log the status change
        const auditQuery = `
          INSERT INTO audit_logs (actor_id, entity, entity_id, action, diff, created_at)
          VALUES ($1, 'catch', $2, 'status_update', $3, NOW())
        `;

        const auditData = {
          old_status: oldStatus,
          new_status: newStatus,
          fisher_id: fisherId,
          notes: notes
        };

        await client.query(auditQuery, [updatedBy, id, JSON.stringify(auditData)]);

        return result.rows.length > 0 ? new Catch(result.rows[0]) : null;
      });
    } catch (error) {
      logger.error('Catch status update error:', error);
      throw error;
    }
  }

  // Get catches pending QC for a society
  static async findPendingQC(societyId = null, limit = 50, offset = 0) {
    try {
      let joinClause = '';
      let whereClause = "WHERE c.status = 'qc_pending'";
      const values = [];
      let paramCount = 0;

      if (societyId) {
        joinClause = 'INNER JOIN users u ON c.fisher_id = u.id';
        paramCount++;
        whereClause += ` AND u.society_id = $${paramCount}`;
        values.push(societyId);
      }

      paramCount++;
      values.push(limit);
      
      paramCount++;
      values.push(offset);

      const selectQuery = `
        SELECT 
          c.id, c.fisher_id, c.species, c.grade, c.gross_weight_kg, c.media_urls,
          c.landed_at, ST_Y(c.geom) as latitude, ST_X(c.geom) as longitude,
          c.cold_chain, c.status, c.landing_center, c.boat_id, c.created_at, c.updated_at,
          u.name as fisher_name
        FROM catches c
        ${joinClause}
        ${whereClause}
        ORDER BY c.landed_at ASC
        LIMIT $${paramCount - 1} OFFSET $${paramCount}
      `;
      
      const result = await query(selectQuery, values);
      return result.rows.map(row => {
        const catch_obj = new Catch(row);
        catch_obj.fisherName = row.fisher_name;
        return catch_obj;
      });
    } catch (error) {
      logger.error('Find pending QC catches error:', error);
      throw error;
    }
  }

  // Get catch statistics
  static async getStatistics(dateRange = null, fisherId = null, societyId = null) {
    try {
      let whereConditions = [];
      const values = [];
      let paramCount = 0;

      if (dateRange && dateRange.start) {
        paramCount++;
        whereConditions.push(`c.landed_at >= $${paramCount}`);
        values.push(dateRange.start);
      }

      if (dateRange && dateRange.end) {
        paramCount++;
        whereConditions.push(`c.landed_at <= $${paramCount}`);
        values.push(dateRange.end);
      }

      if (fisherId) {
        paramCount++;
        whereConditions.push(`c.fisher_id = $${paramCount}`);
        values.push(fisherId);
      }

      let joinClause = '';
      if (societyId) {
        joinClause = 'INNER JOIN users u ON c.fisher_id = u.id';
        paramCount++;
        whereConditions.push(`u.society_id = $${paramCount}`);
        values.push(societyId);
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      const statsQuery = `
        SELECT 
          c.species,
          c.grade,
          c.status,
          COUNT(*) as count,
          SUM(c.gross_weight_kg) as total_weight,
          AVG(c.gross_weight_kg) as avg_weight,
          MIN(c.gross_weight_kg) as min_weight,
          MAX(c.gross_weight_kg) as max_weight
        FROM catches c
        ${joinClause}
        ${whereClause}
        GROUP BY c.species, c.grade, c.status
        ORDER BY c.species, c.grade, c.status
      `;

      const result = await query(statsQuery, values);
      
      const stats = {
        total_catches: 0,
        total_weight: 0,
        by_species: {},
        by_grade: {},
        by_status: {}
      };

      result.rows.forEach(row => {
        const count = parseInt(row.count);
        const weight = parseFloat(row.total_weight);
        
        stats.total_catches += count;
        stats.total_weight += weight;
        
        // By species
        if (!stats.by_species[row.species]) {
          stats.by_species[row.species] = { count: 0, weight: 0 };
        }
        stats.by_species[row.species].count += count;
        stats.by_species[row.species].weight += weight;
        
        // By grade
        if (!stats.by_grade[row.grade]) {
          stats.by_grade[row.grade] = { count: 0, weight: 0 };
        }
        stats.by_grade[row.grade].count += count;
        stats.by_grade[row.grade].weight += weight;
        
        // By status
        if (!stats.by_status[row.status]) {
          stats.by_status[row.status] = { count: 0, weight: 0 };
        }
        stats.by_status[row.status].count += count;
        stats.by_status[row.status].weight += weight;
      });

      return stats;
    } catch (error) {
      logger.error('Catch statistics error:', error);
      throw error;
    }
  }

  // Check if catch is within freshness window
  static async checkFreshness(id, maxHours = 24) {
    try {
      const selectQuery = `
        SELECT 
          id, landed_at,
          EXTRACT(EPOCH FROM (NOW() - landed_at)) / 3600 as hours_since_landing
        FROM catches 
        WHERE id = $1
      `;
      
      const result = await query(selectQuery, [id]);
      
      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      const hoursSinceLanding = parseFloat(row.hours_since_landing);
      
      return {
        id: row.id,
        landedAt: row.landed_at,
        hoursSinceLanding: hoursSinceLanding,
        isFresh: hoursSinceLanding <= maxHours,
        freshnessScore: Math.max(0, 100 - (hoursSinceLanding / maxHours * 100))
      };
    } catch (error) {
      logger.error('Check freshness error:', error);
      throw error;
    }
  }

  // Mark expired catches
  static async markExpiredCatches(maxHours = 24) {
    try {
      const updateQuery = `
        UPDATE catches 
        SET status = $1, updated_at = NOW()
        WHERE status IN ('logged', 'qc_pending', 'qc_approved') 
        AND EXTRACT(EPOCH FROM (NOW() - landed_at)) / 3600 > $2
        RETURNING id, fisher_id, species, landed_at
      `;

      const result = await query(updateQuery, [Catch.STATUS.EXPIRED, maxHours]);
      
      if (result.rows.length > 0) {
        logger.info(`Marked ${result.rows.length} catches as expired`);
      }

      return result.rows;
    } catch (error) {
      logger.error('Mark expired catches error:', error);
      throw error;
    }
  }

  // Get catches for catalog (approved and fresh)
  static async findForCatalog(filters = {}, limit = 50, offset = 0) {
    try {
      let whereConditions = ["c.status = 'qc_approved'"];
      const values = [];
      let paramCount = 0;

      // Only show fresh catches (within 24 hours by default)
      const maxHours = filters.maxFreshnessHours || 24;
      paramCount++;
      whereConditions.push(`EXTRACT(EPOCH FROM (NOW() - c.landed_at)) / 3600 <= ${paramCount}`);
      values.push(maxHours);

      // Location filter
      if (filters.latitude && filters.longitude && filters.radiusKm) {
        paramCount++;
        whereConditions.push(`ST_DWithin(c.geom, ST_SetSRID(ST_MakePoint(${paramCount}, ${paramCount + 1}), 4326)::geography, ${paramCount + 2} * 1000)`);
        values.push(parseFloat(filters.longitude));
        paramCount++;
        values.push(parseFloat(filters.latitude));
        paramCount++;
        values.push(parseFloat(filters.radiusKm));
      }

      // Species filter
      if (filters.species) {
        paramCount++;
        whereConditions.push(`c.species = ${paramCount}`);
        values.push(filters.species);
      }

      // Grade filter
      if (filters.grade) {
        paramCount++;
        whereConditions.push(`c.grade = ${paramCount}`);
        values.push(filters.grade);
      }

      // Weight filter
      if (filters.minWeight) {
        paramCount++;
        whereConditions.push(`c.gross_weight_kg >= ${paramCount}`);
        values.push(parseFloat(filters.minWeight));
      }

      paramCount++;
      values.push(limit);
      
      paramCount++;
      values.push(offset);

      const selectQuery = `
        SELECT 
          c.id, c.fisher_id, c.species, c.grade, c.gross_weight_kg, c.media_urls,
          c.landed_at, ST_Y(c.geom) as latitude, ST_X(c.geom) as longitude,
          c.cold_chain, c.status, c.landing_center, c.boat_id, c.created_at, c.updated_at,
          u.name as fisher_name,
          s.name as society_name,
          EXTRACT(EPOCH FROM (NOW() - c.landed_at)) / 3600 as hours_since_landing,
          (100 - (EXTRACT(EPOCH FROM (NOW() - c.landed_at)) / 3600 / $1 * 100))::integer as freshness_score
        FROM catches c
        INNER JOIN users u ON c.fisher_id = u.id
        LEFT JOIN societies s ON u.society_id = s.id
        WHERE ${whereConditions.join(' AND ')}
        ORDER BY c.landed_at DESC
        LIMIT ${paramCount - 1} OFFSET ${paramCount}
      `;
      
      const result = await query(selectQuery, values);
      return result.rows.map(row => {
        const catch_obj = new Catch(row);
        catch_obj.fisherName = row.fisher_name;
        catch_obj.societyName = row.society_name;
        catch_obj.hoursSinceLanding = parseFloat(row.hours_since_landing);
        catch_obj.freshnessScore = parseInt(row.freshness_score);
        return catch_obj;
      });
    } catch (error) {
      logger.error('Find catches for catalog error:', error);
      throw error;
    }
  }

  // Update catch media URLs
  static async updateMedia(id, mediaUrls) {
    try {
      const updateQuery = `
        UPDATE catches 
        SET media_urls = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING 
          id, fisher_id, species, grade, gross_weight_kg, media_urls,
          landed_at, ST_Y(geom) as latitude, ST_X(geom) as longitude,
          cold_chain, status, landing_center, boat_id, created_at, updated_at
      `;

      const result = await query(updateQuery, [JSON.stringify(mediaUrls), id]);
      return result.rows.length > 0 ? new Catch(result.rows[0]) : null;
    } catch (error) {
      logger.error('Update catch media error:', error);
      throw error;
    }
  }

  // Soft delete catch
  static async delete(id) {
    try {
      const updateQuery = `
        UPDATE catches 
        SET status = 'deleted', updated_at = NOW()
        WHERE id = $1
        RETURNING id
      `;

      const result = await query(updateQuery, [id]);
      return result.rows.length > 0;
    } catch (error) {
      logger.error('Delete catch error:', error);
      throw error;
    }
  }

  // Instance methods
  toJSON() {
    return {
      id: this.id,
      fisherId: this.fisherId,
      species: this.species,
      grade: this.grade,
      grossWeightKg: this.grossWeightKg,
      mediaUrls: this.mediaUrls,
      landedAt: this.landedAt,
      location: {
        latitude: this.latitude,
        longitude: this.longitude
      },
      coldChain: this.coldChain,
      status: this.status,
      landingCenter: this.landingCenter,
      boatId: this.boatId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  // Check if catch is fresh
  isFresh(maxHours = 24) {
    if (!this.landedAt) return false;
    const landedTime = new Date(this.landedAt);
    const now = new Date();
    const hoursDiff = (now - landedTime) / (1000 * 60 * 60);
    return hoursDiff <= maxHours;
  }

  // Get freshness score (0-100)
  getFreshnessScore(maxHours = 24) {
    if (!this.landedAt) return 0;
    const landedTime = new Date(this.landedAt);
    const now = new Date();
    const hoursDiff = (now - landedTime) / (1000 * 60 * 60);
    return Math.max(0, Math.round(100 - (hoursDiff / maxHours * 100)));
  }

  // Check if catch is available for sale
  isAvailableForSale() {
    return this.status === Catch.STATUS.QC_APPROVED && this.isFresh();
  }

  // Get display name for species
  getSpeciesDisplayName() {
    const speciesMap = {
      tuna: 'Tuna',
      sardine: 'Sardine',
      mackerel: 'Mackerel',
      pomfret: 'Pomfret',
      kingfish: 'King Fish',
      prawns: 'Prawns',
      crab: 'Crab',
      lobster: 'Lobster',
      anchovy: 'Anchovy',
      hilsa: 'Hilsa'
    };
    return speciesMap[this.species] || this.species.charAt(0).toUpperCase() + this.species.slice(1);
  }

  // Get display name for grade
  getGradeDisplayName() {
    const gradeMap = {
      premium: 'Premium',
      grade_a: 'Grade A',
      grade_b: 'Grade B',
      grade_c: 'Grade C',
      mixed: 'Mixed'
    };
    return gradeMap[this.grade] || this.grade.charAt(0).toUpperCase() + this.grade.slice(1);
  }
}

module.exports = Catch;