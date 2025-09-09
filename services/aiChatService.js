const Turf = require('../models/Turf');
const User = require('../models/User');
const Booking = require('../models/Booking');

class AIChatService {
  constructor() {
    this.conversationMemory = new Map();
    this.intentPatterns = this.initializeIntentPatterns();
    this.responseTemplates = this.initializeResponseTemplates();
    this.actionHandlers = this.initializeActionHandlers();
  }

  initializeIntentPatterns() {
    return {
      greeting: [
        /^(hi|hello|hey|good morning|good afternoon|good evening)/i,
        /^(how are you|what's up|howdy)/i
      ],
      booking: [
        /(book|booking|reserve|schedule)/i,
        /(available|availability|slot|time)/i,
        /(when can i|what time)/i
      ],
      pricing: [
        /(price|cost|rate|fee|charge)/i,
        /(how much|what's the cost|pricing)/i,
        /(expensive|cheap|budget)/i
      ],
      location: [
        /(nearby|near me|location|where|address)/i,
        /(close to|around|in my area)/i,
        /(distance|far from)/i
      ],
      support: [
        /(help|support|assistance|problem|issue)/i,
        /(contact|customer service|complaint)/i,
        /(refund|cancel|modify)/i
      ],
      account: [
        /(profile|account|settings|dashboard)/i,
        /(login|sign in|register|sign up)/i,
        /(password|forgot|reset)/i
      ],
      turf_info: [
        /(turf|field|ground|facility)/i,
        /(amenities|features|equipment)/i,
        /(size|dimensions|capacity)/i
      ],
      weather: [
        /(weather|rain|sunny|cloudy)/i,
        /(outdoor|indoor|covered)/i,
        /(season|climate)/i
      ]
    };
  }

  initializeResponseTemplates() {
    return {
      greeting: [
        "Hello! I'm your TurfEase assistant. How can I help you today?",
        "Hi there! Welcome to TurfEase. What would you like to know?",
        "Hey! I'm here to help you with turf bookings and more. What's on your mind?"
      ],
      booking: [
        "I can help you find and book turfs! Let me show you available options.",
        "Great! Let's find the perfect turf for you. What sport are you interested in?",
        "I'll help you with the booking process. When are you looking to play?"
      ],
      pricing: [
        "Pricing varies by turf and time. Let me show you current rates.",
        "I can help you compare prices across different turfs. What's your budget range?",
        "Let me find the best deals for you. What time are you looking to book?"
      ],
      location: [
        "I'll help you find turfs near your location. Where are you based?",
        "Let me search for nearby turfs. What's your preferred area?",
        "I can show you turfs in your area. What's your location?"
      ],
      support: [
        "I'm here to help! What specific issue are you facing?",
        "Let me assist you with that. Can you describe the problem?",
        "I'll do my best to resolve this for you. What's the issue?"
      ],
      account: [
        "I can help you with your account settings. What would you like to do?",
        "Let me guide you through your account options. What do you need?",
        "I'll help you manage your account. What's your question?"
      ],
      turf_info: [
        "I can provide detailed information about our turfs. What would you like to know?",
        "Let me tell you about our turf facilities. What interests you?",
        "I'll give you all the details about our turfs. What's your question?"
      ],
      weather: [
        "I can help you find weather-appropriate turfs. What's your preference?",
        "Let me check weather conditions and suggest suitable turfs.",
        "I'll help you find the best turf based on weather conditions."
      ]
    };
  }

  initializeActionHandlers() {
    return {
      searchTurfs: this.searchTurfs.bind(this),
      getPricing: this.getPricing.bind(this),
      checkAvailability: this.checkAvailability.bind(this),
      getUserBookings: this.getUserBookings.bind(this),
      getTurfDetails: this.getTurfDetails.bind(this),
      suggestNearby: this.suggestNearby.bind(this),
      getWeatherInfo: this.getWeatherInfo.bind(this)
    };
  }

  // Action handler methods
  async searchTurfs(filters) {
    try {
      const query = { isApproved: true };
      
      if (filters.sport) {
        query.sport = filters.sport;
      }
      
      const turfs = await Turf.find(query).limit(10);
      return turfs;
    } catch (error) {
      console.error('Error searching turfs:', error);
      return [];
    }
  }

  async getPricing(filters) {
    try {
      const query = { isApproved: true };
      
      if (filters.sport) {
        query.sport = filters.sport;
      }
      
      const turfs = await Turf.find(query).select('pricePerHour');
      
      if (turfs.length === 0) return [];
      
      const prices = turfs.map(t => t.pricePerHour);
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      const avgPrice = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
      
      return [{ minPrice, maxPrice, avgPrice, prices }];
    } catch (error) {
      console.error('Error getting pricing:', error);
      return [];
    }
  }

  async checkAvailability(filters) {
    try {
      const query = { isApproved: true };
      
      if (filters.sport) {
        query.sport = filters.sport;
      }
      
      const turfs = await Turf.find(query).limit(5);
      return turfs;
    } catch (error) {
      console.error('Error checking availability:', error);
      return [];
    }
  }

  async getUserBookings(userId) {
    try {
      const Booking = require('../models/Booking');
      const bookings = await Booking.find({ customerId: userId })
        .populate('turfId', 'name location')
        .sort({ createdAt: -1 })
        .limit(10);
      
      return bookings;
    } catch (error) {
      console.error('Error getting user bookings:', error);
      return [];
    }
  }

  async getTurfDetails(turfId) {
    try {
      const turf = await Turf.findById(turfId);
      return turf;
    } catch (error) {
      console.error('Error getting turf details:', error);
      return null;
    }
  }

  async suggestNearby(location) {
    try {
      const turfs = await Turf.find({ isApproved: true }).limit(5);
      return turfs.map(turf => ({
        ...turf.toObject(),
        distance: Math.random() * 10 // Mock distance calculation
      }));
    } catch (error) {
      console.error('Error suggesting nearby turfs:', error);
      return [];
    }
  }

  async getWeatherInfo(location) {
    // Mock weather data - in production, integrate with weather API
    return {
      condition: 'sunny',
      temperature: 25,
      humidity: 60
    };
  }

  async processMessage(message, context = {}, history = []) {
    try {
      const userId = context.userId;
      const userType = context.userType || 'guest';
      const location = context.location || null;

      // Detect intent
      const intent = this.detectIntent(message);
      
      // Get conversation context
      const conversationContext = this.getConversationContext(userId, history);
      
      // Generate response
      const response = await this.generateResponse(intent, message, context, conversationContext);
      
      // Store conversation context
      this.updateConversationContext(userId, message, response, intent);
      
      // Generate dynamic suggestions
      const suggestions = await this.generateSuggestions(intent, context, conversationContext);
      
      // Check for actions
      const actions = this.getActions(intent, context);

      return {
        reply: response,
        intent: intent,
        suggestions: suggestions,
        actions: actions,
        context: conversationContext,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('AI Chat Service Error:', error);
      return {
        reply: "I'm sorry, I encountered an error processing your request. Please try again.",
        intent: 'error',
        suggestions: ['Try again', 'Contact support', 'Browse turfs'],
        actions: [],
        context: {},
        timestamp: new Date().toISOString()
      };
    }
  }

  detectIntent(message) {
    const lowerMessage = message.toLowerCase();
    
    for (const [intent, patterns] of Object.entries(this.intentPatterns)) {
      for (const pattern of patterns) {
        if (pattern.test(lowerMessage)) {
          return intent;
        }
      }
    }
    
    return 'general';
  }

  async generateResponse(intent, message, context, conversationContext) {
    // Get base response
    let response = this.getBaseResponse(intent);
    
    // Add dynamic content based on intent
    switch (intent) {
      case 'booking':
        response = await this.handleBookingIntent(message, context, conversationContext);
        break;
      case 'pricing':
        response = await this.handlePricingIntent(message, context, conversationContext);
        break;
      case 'location':
        response = await this.handleLocationIntent(message, context, conversationContext);
        break;
      case 'turf_info':
        response = await this.handleTurfInfoIntent(message, context, conversationContext);
        break;
      case 'weather':
        response = await this.handleWeatherIntent(message, context, conversationContext);
        break;
      default:
        response = this.getPersonalizedResponse(intent, context, conversationContext);
    }
    
    return response;
  }

  async handleBookingIntent(message, context, conversationContext) {
    const sport = this.extractSport(message);
    const time = this.extractTime(message);
    const date = this.extractDate(message);
    
    let response = "I'll help you find available turfs for booking. ";
    
    if (sport) {
      response += `Looking for ${sport} turfs. `;
    }
    
    if (time) {
      response += `For ${time}. `;
    }
    
    if (date) {
      response += `On ${date}. `;
    }
    
    // Get available turfs
    const availableTurfs = await this.getAvailableTurfs({ sport, time, date, location: context.location });
    
    if (availableTurfs.length > 0) {
      response += `I found ${availableTurfs.length} available turfs. `;
      response += `The top options are: ${availableTurfs.slice(0, 3).map(t => t.name).join(', ')}. `;
      response += "Would you like me to show you more details about any of these?";
    } else {
      response += "I couldn't find any available turfs matching your criteria. Would you like to try different times or sports?";
    }
    
    return response;
  }

  async handlePricingIntent(message, context, conversationContext) {
    const budget = this.extractBudget(message);
    const sport = this.extractSport(message);
    
    let response = "Here's our current pricing information: ";
    
    // Get pricing data
    const pricingInfo = await this.getPricingInfo({ sport, budget });
    
    if (pricingInfo.length > 0) {
      response += `Our turfs range from ₹${pricingInfo[0].minPrice} to ₹${pricingInfo[0].maxPrice} per hour. `;
      response += `The average price is ₹${pricingInfo[0].avgPrice} per hour. `;
      
      if (budget) {
        const affordableTurfs = pricingInfo.filter(t => t.price <= budget);
        if (affordableTurfs.length > 0) {
          response += `I found ${affordableTurfs.length} turfs within your budget of ₹${budget}. `;
        } else {
          response += `I couldn't find turfs within your budget of ₹${budget}. Would you like to see our most affordable options?`;
        }
      }
    } else {
      response += "Pricing varies by turf and time. Would you like me to show you specific turf prices?";
    }
    
    return response;
  }

  async handleLocationIntent(message, context, conversationContext) {
    const location = this.extractLocation(message) || context.location;
    
    if (!location) {
      return "I'd be happy to help you find nearby turfs! Could you please share your location or tell me which area you're looking in?";
    }
    
    const nearbyTurfs = await this.getNearbyTurfs(location);
    
    let response = `I found ${nearbyTurfs.length} turfs near ${location}. `;
    
    if (nearbyTurfs.length > 0) {
      response += `The closest ones are: ${nearbyTurfs.slice(0, 3).map(t => `${t.name} (${t.distance}km away)`).join(', ')}. `;
      response += "Would you like more details about any of these turfs?";
    } else {
      response += "I couldn't find any turfs in that area. Would you like to try a different location?";
    }
    
    return response;
  }

  async handleTurfInfoIntent(message, context, conversationContext) {
    const turfName = this.extractTurfName(message);
    
    if (turfName) {
      const turf = await this.getTurfByName(turfName);
      if (turf) {
        return `Here's information about ${turf.name}: ${turf.description}. It's located at ${turf.location.address} and costs ₹${turf.pricePerHour}/hour. Amenities include: ${turf.amenities.join(', ')}. Would you like to book this turf?`;
      } else {
        return `I couldn't find a turf named "${turfName}". Could you check the spelling or try a different name?`;
      }
    }
    
    return "I can provide information about any of our turfs. Which turf would you like to know about?";
  }

  async handleWeatherIntent(message, context, conversationContext) {
    const weather = await this.getWeatherInfo(context.location);
    
    if (weather) {
      let response = `The current weather is ${weather.condition} with a temperature of ${weather.temperature}°C. `;
      
      if (weather.condition.includes('rain') || weather.condition.includes('storm')) {
        response += "I recommend booking indoor turfs or covered facilities today. Would you like me to show you some options?";
      } else if (weather.condition.includes('sunny') || weather.condition.includes('clear')) {
        response += "Perfect weather for outdoor sports! I can show you our best outdoor turfs. Would you like to see them?";
      } else {
        response += "The weather looks good for playing. Would you like me to find some available turfs for you?";
      }
      
      return response;
    }
    
    return "I can help you find weather-appropriate turfs. What's your preferred location?";
  }

  getPersonalizedResponse(intent, context, conversationContext) {
    const userName = context.userName || 'there';
    const userType = context.userType || 'guest';
    
    let response = `Hi ${userName}! `;
    
    if (userType === 'owner') {
      response += "As a turf owner, I can help you manage your turfs, view bookings, and track analytics. What would you like to do?";
    } else if (userType === 'player') {
      response += "I can help you find and book turfs, check availability, and manage your bookings. What can I do for you?";
    } else {
      response += "I can help you discover turfs, check prices, and guide you through the booking process. What would you like to know?";
    }
    
    return response;
  }

  async generateSuggestions(intent, context, conversationContext) {
    const suggestions = [];
    
    switch (intent) {
      case 'booking':
        suggestions.push('Show available turfs', 'Check my bookings', 'Book for tomorrow', 'Find football turfs');
        break;
      case 'pricing':
        suggestions.push('Show cheapest options', 'Compare prices', 'Budget-friendly turfs', 'Premium turfs');
        break;
      case 'location':
        suggestions.push('Find nearby turfs', 'Show on map', 'Different area', 'Current location');
        break;
      case 'support':
        suggestions.push('Contact support', 'Report issue', 'Cancel booking', 'Modify booking');
        break;
      default:
        suggestions.push('Browse turfs', 'Check prices', 'Find nearby', 'My bookings');
    }
    
    return suggestions.slice(0, 4);
  }

  getActions(intent, context) {
    const actions = [];
    
    switch (intent) {
      case 'booking':
        actions.push({ type: 'button', text: 'View Available Turfs', action: 'show_turfs' });
        actions.push({ type: 'button', text: 'Book Now', action: 'start_booking' });
        break;
      case 'pricing':
        actions.push({ type: 'button', text: 'Compare Prices', action: 'compare_prices' });
        actions.push({ type: 'button', text: 'Show Deals', action: 'show_deals' });
        break;
      case 'location':
        actions.push({ type: 'button', text: 'Use My Location', action: 'get_location' });
        actions.push({ type: 'button', text: 'Show on Map', action: 'show_map' });
        break;
    }
    
    return actions;
  }

  // Helper methods for data extraction
  extractSport(message) {
    const sports = ['football', 'cricket', 'tennis', 'basketball', 'badminton', 'volleyball'];
    const lowerMessage = message.toLowerCase();
    
    for (const sport of sports) {
      if (lowerMessage.includes(sport)) {
        return sport;
      }
    }
    return null;
  }

  extractTime(message) {
    const timePatterns = [
      /(\d{1,2}):(\d{2})\s*(am|pm)?/i,
      /(morning|afternoon|evening|night)/i,
      /(early|late)/i
    ];
    
    for (const pattern of timePatterns) {
      const match = message.match(pattern);
      if (match) {
        return match[0];
      }
    }
    return null;
  }

  extractDate(message) {
    const datePatterns = [
      /(today|tomorrow|yesterday)/i,
      /(\d{1,2})\/(\d{1,2})\/(\d{4})/,
      /(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i
    ];
    
    for (const pattern of datePatterns) {
      const match = message.match(pattern);
      if (match) {
        return match[0];
      }
    }
    return null;
  }

  extractBudget(message) {
    const budgetMatch = message.match(/₹?(\d+)/);
    return budgetMatch ? parseInt(budgetMatch[1]) : null;
  }

  extractLocation(message) {
    const locationPatterns = [
      /(in|at|near|around)\s+([a-zA-Z\s]+)/i,
      /([a-zA-Z\s]+)\s+(area|city|town)/i
    ];
    
    for (const pattern of locationPatterns) {
      const match = message.match(pattern);
      if (match) {
        return match[2] || match[1];
      }
    }
    return null;
  }

  extractTurfName(message) {
    // This would need to be more sophisticated in a real implementation
    const turfMatch = message.match(/turf\s+([a-zA-Z\s]+)/i);
    return turfMatch ? turfMatch[1].trim() : null;
  }

  // Data access methods
  async getAvailableTurfs(filters) {
    return this.searchTurfs(filters);
  }

  async getPricingInfo(filters) {
    return this.getPricing(filters);
  }

  async getNearbyTurfs(location) {
    return this.suggestNearby(location);
  }

  async getTurfByName(name) {
    try {
      return await Turf.findOne({ name: new RegExp(name, 'i'), isApproved: true });
    } catch (error) {
      console.error('Error fetching turf by name:', error);
      return null;
    }
  }

  getBaseResponse(intent) {
    const templates = this.responseTemplates[intent];
    if (templates && templates.length > 0) {
      return templates[Math.floor(Math.random() * templates.length)];
    }
    return "I'm here to help! What would you like to know?";
  }

  getConversationContext(userId, history) {
    if (!userId) return {};
    
    const context = this.conversationMemory.get(userId) || {};
    
    // Update context based on recent history
    if (history && history.length > 0) {
      const recentMessages = history.slice(-5);
      context.recentTopics = recentMessages.map(msg => msg.content).join(' ');
      context.lastIntent = this.detectIntent(recentMessages[recentMessages.length - 1]?.content || '');
    }
    
    return context;
  }

  updateConversationContext(userId, message, response, intent) {
    if (!userId) return;
    
    const context = this.conversationMemory.get(userId) || {};
    context.lastMessage = message;
    context.lastResponse = response;
    context.lastIntent = intent;
    context.timestamp = new Date().toISOString();
    
    this.conversationMemory.set(userId, context);
  }

  // Cleanup old conversation contexts
  cleanupOldContexts() {
    const now = new Date();
    const oneHour = 60 * 60 * 1000;
    
    for (const [userId, context] of this.conversationMemory.entries()) {
      if (now - new Date(context.timestamp) > oneHour) {
        this.conversationMemory.delete(userId);
      }
    }
  }
}

module.exports = new AIChatService();
