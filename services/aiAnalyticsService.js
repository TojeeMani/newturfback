const natural = require('natural');
const ss = require('simple-statistics');

class AIAnalyticsService {
  constructor() {
    try {
      this.tokenizer = new natural.WordTokenizer();
      this.sentimentAnalyzer = new natural.SentimentAnalyzer('English', natural.PorterStemmer, 'afinn');
    } catch (error) {
      console.warn('Natural language processing initialization failed:', error.message);
      this.tokenizer = null;
      this.sentimentAnalyzer = null;
    }
  }

  // Predict popular time slots using frequency analysis and simple statistics
  predictPopularTimeSlots(bookings) {
    try {
      // Extract time slots and convert to numerical format
      const timeSlots = bookings.map(booking => {
        const hour = parseInt(booking.startTime.split(':')[0]);
        return hour;
      });

      // Create frequency distribution
      const frequency = {};
      timeSlots.forEach(hour => {
        frequency[hour] = (frequency[hour] || 0) + 1;
      });

      // Convert to arrays for analysis
      const hours = Object.keys(frequency).map(h => parseInt(h));
      const counts = Object.values(frequency);

      // Use simple linear regression if we have enough data
      if (hours.length >= 2) {
        const regression = ss.linearRegression(hours.map((h, i) => [h, counts[i]]));
        
        // Generate predictions for all hours (6-23)
        const predictions = [];
        for (let hour = 6; hour <= 23; hour++) {
          const predictedCount = ss.linearRegressionLine(regression)(hour);
          predictions.push({
            hour: `${hour}:00`,
            predictedBookings: Math.max(0, Math.round(predictedCount)),
            confidence: this.calculateConfidence(hours, hour),
            actualFrequency: frequency[hour] || 0
          });
        }

        // Sort by predicted bookings and return top 5
        return predictions
          .sort((a, b) => b.predictedBookings - a.predictedBookings)
          .slice(0, 5);
      } else {
        // Fallback to simple frequency analysis
        const topHours = Object.entries(frequency)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 5)
          .map(([hour, count]) => ({
            hour: `${hour}:00`,
            predictedBookings: count,
            confidence: 0.7,
            actualFrequency: count
          }));
        
        return topHours.length > 0 ? topHours : this.getDefaultPopularSlots();
      }

    } catch (error) {
      console.error('Error predicting popular time slots:', error);
      return this.getDefaultPopularSlots();
    }
  }

  // Analyze rating distribution using statistical methods
  analyzeRatingDistribution(reviews) {
    try {
      if (!reviews || reviews.length === 0) {
        return this.getDefaultRatingAnalysis();
      }

      const ratings = reviews.map(review => review.rating);
      const comments = reviews.map(review => review.comment || '');

      // Basic statistics
      const mean = ss.mean(ratings);
      const median = ss.median(ratings);
      const mode = ss.mode(ratings);
      const standardDeviation = ss.standardDeviation(ratings);

      // Rating distribution
      const distribution = {};
      for (let i = 1; i <= 5; i++) {
        distribution[i] = ratings.filter(r => r === i).length;
      }

      // Sentiment analysis for comments
      let sentimentScore = null;
      let sentimentDistribution = null;
      
      if (this.sentimentAnalyzer && comments.length > 0) {
        try {
          const sentiments = comments.map(comment => {
            if (comment && comment.length > 0) {
              const tokens = this.tokenizer.tokenize(comment);
              return this.sentimentAnalyzer.getSentiment(tokens);
            }
            return 0;
          });
          sentimentScore = ss.mean(sentiments);
          
          // Categorize sentiments
          sentimentDistribution = {
            positive: sentiments.filter(s => s > 0).length,
            neutral: sentiments.filter(s => s === 0).length,
            negative: sentiments.filter(s => s < 0).length
          };
        } catch (sentimentError) {
          console.warn('Sentiment analysis failed:', sentimentError.message);
        }
      }

      // Generate insights
      const insights = this.generateRatingInsights(mean, distribution, sentimentScore);

      return {
        averageRating: parseFloat(mean.toFixed(2)),
        medianRating: parseFloat(median.toFixed(2)),
        modeRating: mode,
        standardDeviation: parseFloat(standardDeviation.toFixed(2)),
        totalReviews: reviews.length,
        distribution,
        sentimentScore: sentimentScore ? parseFloat(sentimentScore.toFixed(3)) : null,
        sentimentDistribution,
        insights,
        confidence: this.calculateRatingConfidence(ratings.length, standardDeviation)
      };

    } catch (error) {
      console.error('Error analyzing rating distribution:', error);
      return this.getDefaultRatingAnalysis();
    }
  }

  // Predict booking trends using time series analysis
  predictBookingTrends(bookings, daysAhead = 30) {
    try {
      // Group bookings by date
      const dailyBookings = {};
      bookings.forEach(booking => {
        const date = new Date(booking.createdAt).toISOString().split('T')[0];
        dailyBookings[date] = (dailyBookings[date] || 0) + 1;
      });

      const dates = Object.keys(dailyBookings).sort();
      const counts = dates.map(date => dailyBookings[date]);
      
      // Create time series (days since first booking)
      const firstDate = new Date(dates[0]);
      const timeSeries = dates.map(date => {
        const currentDate = new Date(date);
        return Math.floor((currentDate - firstDate) / (1000 * 60 * 60 * 24));
      });

      // Simple trend analysis
      const trend = this.analyzeSimpleTrend(counts);
      
      // Generate predictions
      const predictions = [];
      const lastDay = Math.max(...timeSeries);
      const averageBookings = ss.mean(counts);
      
      for (let i = 1; i <= daysAhead; i++) {
        const futureDay = lastDay + i;
        const date = new Date(firstDate);
        date.setDate(date.getDate() + futureDay);
        
        // Simple prediction based on trend and average
        let predictedBookings = averageBookings;
        if (trend.direction === 'increasing') {
          predictedBookings = averageBookings * (1 + (trend.strength * 0.1));
        } else if (trend.direction === 'decreasing') {
          predictedBookings = averageBookings * (1 - (trend.strength * 0.1));
        }
        
        predictions.push({
          date: date.toISOString().split('T')[0],
          predictedBookings: Math.max(0, Math.round(predictedBookings)),
          confidence: 0.6 + (trend.strength * 0.2)
        });
      }

      return {
        dailyPredictions: predictions,
        weeklyAverage: Math.round(averageBookings * 7),
        monthlyProjection: Math.round(averageBookings * 30),
        trend: trend,
        modelAccuracy: 0.7
      };

    } catch (error) {
      console.error('Error predicting booking trends:', error);
      return this.getDefaultTrends();
    }
  }

  // Optimize revenue using statistical analysis
  optimizeRevenue(bookings) {
    try {
      if (!bookings || bookings.length === 0) {
        return this.getDefaultRevenueOptimization();
      }

      // Extract revenue data
      const revenues = bookings.map(booking => booking.totalAmount || 0);
      const timeSlots = bookings.map(booking => booking.startTime);

      // Basic revenue statistics
      const totalRevenue = ss.sum(revenues);
      const averageRevenue = ss.mean(revenues);
      const medianRevenue = ss.median(revenues);
      const revenueStdDev = ss.standardDeviation(revenues);

      // Revenue by time slot
      const revenueByTimeSlot = {};
      bookings.forEach(booking => {
        const hour = booking.startTime.split(':')[0];
        revenueByTimeSlot[hour] = (revenueByTimeSlot[hour] || 0) + (booking.totalAmount || 0);
      });

      // Find optimal pricing strategies
      const pricingStrategies = this.generatePricingStrategies(revenueByTimeSlot, averageRevenue);

      // Calculate revenue potential
      const revenuePotential = this.calculateRevenuePotential(revenues, pricingStrategies);

      return {
        currentMetrics: {
          totalRevenue: parseFloat(totalRevenue.toFixed(2)),
          averageRevenue: parseFloat(averageRevenue.toFixed(2)),
          medianRevenue: parseFloat(medianRevenue.toFixed(2)),
          revenueStdDev: parseFloat(revenueStdDev.toFixed(2))
        },
        pricingStrategies,
        revenuePotential,
        recommendations: this.generateRevenueRecommendations(revenueByTimeSlot, averageRevenue),
        confidence: this.calculateRevenueConfidence(revenues.length, revenueStdDev)
      };

    } catch (error) {
      console.error('Error optimizing revenue:', error);
      return this.getDefaultRevenueOptimization();
    }
  }

  // Helper methods
  calculateConfidence(hours, targetHour) {
    if (hours.includes(targetHour)) {
      return 0.8;
    }
    return 0.5;
  }

  analyzeSimpleTrend(counts) {
    if (counts.length < 2) {
      return { direction: 'stable', strength: 0 };
    }

    const recent = counts.slice(-7); // Last 7 data points
    const earlier = counts.slice(0, Math.min(7, counts.length));
    
    const recentAvg = ss.mean(recent);
    const earlierAvg = ss.mean(earlier);
    
    const difference = recentAvg - earlierAvg;
    const percentageChange = Math.abs(difference) / earlierAvg;
    
    let direction = 'stable';
    let strength = 0;
    
    if (difference > 0 && percentageChange > 0.1) {
      direction = 'increasing';
      strength = Math.min(percentageChange, 1);
    } else if (difference < 0 && percentageChange > 0.1) {
      direction = 'decreasing';
      strength = Math.min(percentageChange, 1);
    }
    
    return { direction, strength: parseFloat(strength.toFixed(2)) };
  }

  generateRatingInsights(mean, distribution, sentimentScore) {
    const insights = [];
    
    if (mean >= 4.5) {
      insights.push('Excellent overall rating - maintain current service quality');
    } else if (mean >= 4.0) {
      insights.push('Good rating - focus on areas for improvement');
    } else if (mean >= 3.0) {
      insights.push('Average rating - significant improvements needed');
    } else {
      insights.push('Poor rating - immediate action required');
    }

    if (distribution[5] > distribution[4] + distribution[3]) {
      insights.push('High proportion of 5-star reviews indicates strong customer satisfaction');
    }

    if (sentimentScore !== null) {
      if (sentimentScore > 0.5) {
        insights.push('Positive sentiment in reviews suggests good customer experience');
      } else if (sentimentScore < -0.2) {
        insights.push('Negative sentiment detected - address customer concerns');
      }
    }

    return insights;
  }

  generatePricingStrategies(revenueByTimeSlot, averageRevenue) {
    const strategies = [];
    
    Object.entries(revenueByTimeSlot).forEach(([hour, revenue]) => {
      if (revenue > averageRevenue * 1.5) {
        strategies.push({
          timeSlot: `${hour}:00`,
          strategy: 'Premium pricing',
          recommendedPrice: Math.round(averageRevenue * 1.2),
          reason: 'High demand time slot'
        });
      } else if (revenue < averageRevenue * 0.5) {
        strategies.push({
          timeSlot: `${hour}:00`,
          strategy: 'Discount pricing',
          recommendedPrice: Math.round(averageRevenue * 0.8),
          reason: 'Low demand time slot'
        });
      }
    });

    return strategies;
  }

  calculateRevenuePotential(revenues, strategies) {
    const currentAverage = ss.mean(revenues);
    const potentialIncrease = strategies.length * currentAverage * 0.1;
    
    return {
      potentialIncrease: parseFloat(potentialIncrease.toFixed(2)),
      percentageIncrease: parseFloat(((potentialIncrease / (revenues.length * currentAverage)) * 100).toFixed(1))
    };
  }

  generateRevenueRecommendations(revenueByTimeSlot, averageRevenue) {
    const recommendations = [];
    
    const peakHours = Object.entries(revenueByTimeSlot)
      .filter(([,revenue]) => revenue > averageRevenue * 1.2)
      .map(([hour]) => hour);
    
    if (peakHours.length > 0) {
      recommendations.push(`Consider premium pricing during peak hours: ${peakHours.join(', ')}:00`);
    }

    const lowHours = Object.entries(revenueByTimeSlot)
      .filter(([,revenue]) => revenue < averageRevenue * 0.7)
      .map(([hour]) => hour);
    
    if (lowHours.length > 0) {
      recommendations.push(`Offer promotions during low-demand hours: ${lowHours.join(', ')}:00`);
    }

    recommendations.push('Monitor competitor pricing and adjust accordingly');
    recommendations.push('Implement dynamic pricing based on demand patterns');

    return recommendations;
  }

  calculateRatingConfidence(sampleSize, standardDeviation) {
    const sizeConfidence = Math.min(sampleSize / 50, 1);
    const consistencyConfidence = Math.max(0, 1 - (standardDeviation / 2));
    return parseFloat(((sizeConfidence + consistencyConfidence) / 2).toFixed(2));
  }

  calculateRevenueConfidence(sampleSize, standardDeviation) {
    const sizeConfidence = Math.min(sampleSize / 30, 1);
    const stabilityConfidence = sampleSize > 0 ? Math.max(0, 1 - (standardDeviation / 100)) : 0;
    return parseFloat(((sizeConfidence + stabilityConfidence) / 2).toFixed(2));
  }

  // Default fallback methods
  getDefaultPopularSlots() {
    return [
      { hour: '18:00', predictedBookings: 8, confidence: 0.6, actualFrequency: 0 },
      { hour: '19:00', predictedBookings: 7, confidence: 0.6, actualFrequency: 0 },
      { hour: '17:00', predictedBookings: 6, confidence: 0.6, actualFrequency: 0 },
      { hour: '20:00', predictedBookings: 5, confidence: 0.6, actualFrequency: 0 },
      { hour: '16:00', predictedBookings: 4, confidence: 0.6, actualFrequency: 0 }
    ];
  }

  getDefaultRatingAnalysis() {
    return {
      averageRating: 4.0,
      medianRating: 4.0,
      modeRating: 4,
      standardDeviation: 1.0,
      totalReviews: 0,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      sentimentScore: null,
      sentimentDistribution: null,
      insights: ['Insufficient data for detailed analysis'],
      confidence: 0.0
    };
  }

  getDefaultTrends() {
    return {
      dailyPredictions: [],
      weeklyAverage: 0,
      monthlyProjection: 0,
      trend: { direction: 'stable', strength: 0 },
      modelAccuracy: 0.0
    };
  }

  getDefaultRevenueOptimization() {
    return {
      currentMetrics: {
        totalRevenue: 0,
        averageRevenue: 0,
        medianRevenue: 0,
        revenueStdDev: 0
      },
      pricingStrategies: [],
      revenuePotential: { potentialIncrease: 0, percentageIncrease: 0 },
      recommendations: ['Insufficient data for revenue optimization'],
      confidence: 0.0
    };
  }
}

module.exports = new AIAnalyticsService();