const express = require('express');
const router = express.Router();
const aiChatService = require('../services/aiChatService');
const { optionalAuth } = require('../middleware/auth');

// Advanced AI-powered chat assistant
router.post('/', optionalAuth, async (req, res) => {
  try {
    const { message = '', context = {}, history = [] } = req.body || {};
    
    // Validate input
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Message is required and must be a non-empty string' 
      });
    }

    // Prepare enhanced context
    const enhancedContext = {
      ...context,
      userId: req.user?.id,
      userType: req.user?.userType || 'guest',
      userName: req.user?.firstName || 'Guest',
      timestamp: new Date().toISOString(),
      sessionId: req.sessionID || 'anonymous'
    };

    // Process message with AI service
    const aiResponse = await aiChatService.processMessage(message, enhancedContext, history);

    // Log conversation for analytics (optional)
    if (process.env.NODE_ENV === 'production') {
      console.log(`Chat interaction - User: ${enhancedContext.userId}, Intent: ${aiResponse.intent}, Message: ${message.substring(0, 50)}...`);
    }

    return res.status(200).json({ 
      success: true, 
      data: {
        reply: aiResponse.reply,
        intent: aiResponse.intent,
        suggestions: aiResponse.suggestions,
        actions: aiResponse.actions,
        context: aiResponse.context,
        timestamp: aiResponse.timestamp
      }
    });
  } catch (err) {
    console.error('Chat API Error:', err);
    
    // Fallback response
    const fallbackResponse = {
      reply: "I'm experiencing some technical difficulties right now. Please try again in a moment, or contact our support team if the issue persists.",
      intent: 'error',
      suggestions: ['Try again', 'Contact support', 'Browse turfs'],
      actions: [],
      context: {},
      timestamp: new Date().toISOString()
    };

    return res.status(200).json({ 
      success: true, 
      data: fallbackResponse 
    });
  }
});

// Get chat suggestions based on user context
router.get('/suggestions', optionalAuth, async (req, res) => {
  try {
    const { context = {} } = req.query;
    const userContext = {
      userId: req.user?.id,
      userType: req.user?.userType || 'guest',
      userName: req.user?.firstName || 'Guest'
    };

    const suggestions = await aiChatService.generateSuggestions('general', userContext, {});
    
    return res.status(200).json({ 
      success: true, 
      data: { suggestions } 
    });
  } catch (err) {
    console.error('Suggestions API Error:', err);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch suggestions' 
    });
  }
});

// Get conversation history for a user
router.get('/history', optionalAuth, async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        error: 'User authentication required' 
      });
    }

    // In a real implementation, you would fetch from a database
    // For now, return empty history
    return res.status(200).json({ 
      success: true, 
      data: { history: [] } 
    });
  } catch (err) {
    console.error('History API Error:', err);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch conversation history' 
    });
  }
});

// Clear conversation history
router.delete('/history', optionalAuth, async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        error: 'User authentication required' 
      });
    }

    // Clear conversation context
    aiChatService.conversationMemory.delete(userId);

    return res.status(200).json({ 
      success: true, 
      message: 'Conversation history cleared' 
    });
  } catch (err) {
    console.error('Clear History API Error:', err);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to clear conversation history' 
    });
  }
});

// Execute chat actions
router.post('/action', optionalAuth, async (req, res) => {
  try {
    const { action, context = {} } = req.body;
    
    if (!action) {
      return res.status(400).json({ 
        success: false, 
        error: 'Action is required' 
      });
    }

    const userId = req.user?.id;
    const userType = req.user?.userType || 'guest';

    // Handle different action types
    let result = { success: true, message: 'Action executed successfully' };

    switch (action) {
      case 'show_turfs':
        result = await handleShowTurfsAction(context);
        break;
      case 'start_booking':
        result = await handleStartBookingAction(context, userId);
        break;
      case 'compare_prices':
        result = await handleComparePricesAction(context);
        break;
      case 'show_deals':
        result = await handleShowDealsAction(context);
        break;
      case 'get_location':
        result = await handleGetLocationAction(context);
        break;
      case 'show_map':
        result = await handleShowMapAction(context);
        break;
      case 'view_bookings':
        result = await handleViewBookingsAction(userId);
        break;
      case 'view_analytics':
        result = await handleViewAnalyticsAction(userId, userType);
        break;
      default:
        result = { success: false, message: 'Unknown action' };
    }

    return res.status(200).json({ 
      success: true, 
      data: result 
    });
  } catch (err) {
    console.error('Action execution error:', err);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to execute action' 
    });
  }
});

// Action handlers
async function handleShowTurfsAction(context) {
  try {
    const Turf = require('../models/Turf');
    const query = { isApproved: true };
    
    if (context.sport) {
      query.sport = context.sport;
    }
    
    const turfs = await Turf.find(query).limit(10).select('name location pricePerHour images sport');
    
    return {
      success: true,
      message: `Found ${turfs.length} turfs`,
      data: { turfs }
    };
  } catch (error) {
    return { success: false, message: 'Failed to fetch turfs' };
  }
}

async function handleStartBookingAction(context, userId) {
  if (!userId) {
    return { success: false, message: 'Please log in to start booking' };
  }
  
  return {
    success: true,
    message: 'Redirecting to booking page...',
    redirect: '/bookings'
  };
}

async function handleComparePricesAction(context) {
  try {
    const Turf = require('../models/Turf');
    const turfs = await Turf.find({ isApproved: true }).select('name pricePerHour sport');
    
    const priceRanges = turfs.reduce((acc, turf) => {
      if (!acc[turf.sport]) {
        acc[turf.sport] = { min: turf.pricePerHour, max: turf.pricePerHour };
      } else {
        acc[turf.sport].min = Math.min(acc[turf.sport].min, turf.pricePerHour);
        acc[turf.sport].max = Math.max(acc[turf.sport].max, turf.pricePerHour);
      }
      return acc;
    }, {});
    
    return {
      success: true,
      message: 'Price comparison generated',
      data: { priceRanges }
    };
  } catch (error) {
    return { success: false, message: 'Failed to compare prices' };
  }
}

async function handleShowDealsAction(context) {
  try {
    const Turf = require('../models/Turf');
    const turfs = await Turf.find({ isApproved: true })
      .sort({ pricePerHour: 1 })
      .limit(5)
      .select('name pricePerHour images sport');
    
    return {
      success: true,
      message: `Found ${turfs.length} great deals`,
      data: { deals: turfs }
    };
  } catch (error) {
    return { success: false, message: 'Failed to fetch deals' };
  }
}

async function handleGetLocationAction(context) {
  return {
    success: true,
    message: 'Location services enabled',
    data: { locationEnabled: true }
  };
}

async function handleShowMapAction(context) {
  return {
    success: true,
    message: 'Opening map view...',
    redirect: '/map'
  };
}

async function handleViewBookingsAction(userId) {
  if (!userId) {
    return { success: false, message: 'Please log in to view bookings' };
  }
  
  try {
    const Booking = require('../models/Booking');
    const bookings = await Booking.find({ customerId: userId })
      .populate('turfId', 'name location')
      .sort({ createdAt: -1 })
      .limit(10);
    
    return {
      success: true,
      message: `Found ${bookings.length} bookings`,
      data: { bookings }
    };
  } catch (error) {
    return { success: false, message: 'Failed to fetch bookings' };
  }
}

async function handleViewAnalyticsAction(userId, userType) {
  if (!userId) {
    return { success: false, message: 'Please log in to view analytics' };
  }
  
  if (userType !== 'owner' && userType !== 'admin') {
    return { success: false, message: 'Analytics only available for owners and admins' };
  }
  
  return {
    success: true,
    message: 'Redirecting to analytics dashboard...',
    redirect: '/analytics'
  };
}

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({ 
    success: true, 
    message: 'Chat service is running',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;


