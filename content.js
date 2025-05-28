// Storage keys
const STORAGE_KEYS = {
    usernames: 'filteredUsernames',
    showCount: 'showBlockedCount'
  };
  
  // DOM Query Cache using WeakMap for memory efficiency
  class ElementCache {
    constructor() {
      this.processedElements = new WeakSet();
      this.sellerLinkSelector = 'a[href^="/sellers/"]';
    }
    
    isProcessed(element) {
      return this.processedElements.has(element);
    }
    
    markProcessed(element) {
      this.processedElements.add(element);
    }
    
    findElementsInNode(node) {
      const elements = [];
      
      // Handle single element or document fragment
      const searchRoot = node.nodeType === Node.ELEMENT_NODE ? node : document;
      const links = searchRoot.querySelectorAll(this.sellerLinkSelector);
      
      for (const link of links) {
        if (this.isProcessed(link)) continue;
        
        // More robust parent finding strategy
        const parent = this.findItemContainer(link);
        if (parent && !parent.hasAttribute('data-filtered-processed')) {
          elements.push({ link, parent });
          this.markProcessed(link);
          parent.setAttribute('data-filtered-processed', 'true');
        }
      }
      
      return elements;
    }
    
    findItemContainer(sellerLink) {
      // Strategy 1: Look for a parent that contains both the seller link and a product title link
      let current = sellerLink.parentElement;
      let maxDepth = 10; // Prevent infinite traversal
      
      while (current && maxDepth > 0) {
        // Check if this container has the structure we expect:
        // - Contains our seller link
        // - Contains a product link (to /listings/)
        // - Contains an image
        const hasProductLink = current.querySelector('a[href^="/listings/"]');
        const hasImage = current.querySelector('img');
        const hasFabkitClasses = current.className && current.className.includes('fabkit-');
        
        if (hasProductLink && hasImage) {
          // Additional validation: ensure this is a product card structure
          // Check for fabkit classes which seem to be more stable
          if (hasFabkitClasses || current.querySelector('[class*="fabkit-Surface-root"]')) {
            return current;
          }
        }
        
        current = current.parentElement;
        maxDepth--;
      }
      
      // Strategy 2: Fallback to finding the nearest container with specific structural patterns
      // Look for a container that has fabkit-Stack classes and contains our specific structure
      const stackContainer = sellerLink.closest('div[class*="fabkit-Stack"]');
      if (stackContainer) {
        // Traverse up to find the outermost product container
        let productContainer = stackContainer;
        let parent = stackContainer.parentElement;
        
        while (parent && parent.classList.contains('fabkit-Stack-root')) {
          // Keep going up if we're still in Stack containers
          productContainer = parent;
          parent = parent.parentElement;
        }
        
        // Validate this is a product card
        const hasProductLink = productContainer.querySelector('a[href^="/listings/"]');
        const hasImage = productContainer.querySelector('img');
        
        if (hasProductLink && hasImage) {
          return productContainer;
        }
      }
      
      return null;
    }
  }
  
  // Resource manager for cleanup
  class ContentResourceManager {
    constructor() {
      this.observer = null;
      this.listeners = [];
      this.timers = [];
      this.styles = [];
    }
    
    setObserver(observer) {
      this.observer = observer;
    }
    
    addEventListener(element, event, handler, options) {
      element.addEventListener(event, handler, options);
      this.listeners.push({ element, event, handler, options });
    }
    
    setTimeout(fn, delay) {
      const timer = setTimeout(fn, delay);
      this.timers.push(timer);
      return timer;
    }
    
    addStyle(styleElement) {
      this.styles.push(styleElement);
    }
    
    cleanup() {
      // Disconnect observer
      if (this.observer) {
        this.observer.disconnect();
      }
      
      // Remove event listeners
      this.listeners.forEach(({ element, event, handler, options }) => {
        element.removeEventListener(event, handler, options);
      });
      
      // Clear timers
      this.timers.forEach(timer => clearTimeout(timer));
      
      // Remove injected styles
      this.styles.forEach(style => style.remove());
      
      // Clear arrays
      this.observer = null;
      this.listeners = [];
      this.timers = [];
      this.styles = [];
    }
  }
  
  // Message validator for secure communication
  class MessageValidator {
    static validate(message) {
      const allowedActions = ['updateFilters', 'updateShowCount'];
      
      if (!message || typeof message !== 'object') {
        throw new Error('Invalid message format');
      }
      
      if (!allowedActions.includes(message.action)) {
        throw new Error('Invalid action');
      }
      
      switch (message.action) {
        case 'updateFilters':
          if (!Array.isArray(message.usernames)) {
            throw new Error('Invalid usernames format');
          }
          message.usernames.forEach(username => {
            if (typeof username !== 'string') {
              throw new Error('Invalid username type');
            }
          });
          break;
          
        case 'updateShowCount':
          if (typeof message.showCount !== 'boolean') {
            throw new Error('Invalid showCount format');
          }
          break;
      }
      
      return true;
    }
  }
  
  // Main filter manager
  class FabFilter {
    constructor() {
      this.filteredUsernames = new Set();
      this.showBlockedCount = false;
      this.blockedCount = 0;
      this.elementCache = new ElementCache();
      this.resourceManager = new ContentResourceManager();
      this.pendingMutations = new Set();
      this.mutationTimeout = null;
    }
    
    async initialize() {
      try {
        // Check if extension context is valid
        if (!chrome.runtime?.id) {
          console.warn('Extension context invalid, skipping initialization');
          return;
        }
        
        // Load saved settings
        const data = await chrome.storage.sync.get([STORAGE_KEYS.usernames, STORAGE_KEYS.showCount]);
        this.filteredUsernames = new Set(data[STORAGE_KEYS.usernames] || []);
        this.showBlockedCount = data[STORAGE_KEYS.showCount] || false;
        
        // Inject styles
        this.injectStyles();
        
        // Apply initial filtering
        this.filterExistingContent();
        
        // Set up observer for dynamic content
        this.setupMutationObserver();
        
        // Listen for messages from popup
        chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));
        
        // Listen for extension updates/reloads
        if (chrome.runtime.onSuspend) {
          chrome.runtime.onSuspend.addListener(() => this.cleanup());
        }
        
        // Update badge with initial count
        this.updateBadge();
        
        // Cleanup on page unload
        window.addEventListener('unload', () => this.cleanup());
        
      } catch (error) {
        if (error.message?.includes('Extension context invalidated')) {
          console.debug('Extension was reloaded or removed');
        } else {
          console.error('Failed to initialize fab filter:', error);
        }
      }
    }
    
    injectStyles() {
      const style = document.createElement('style');
      style.textContent = `
        [data-filtered="true"] {
          display: none !important;
        }
      `;
      document.head.appendChild(style);
      this.resourceManager.addStyle(style);
    }
    
    handleMessage(message, sender, sendResponse) {
      try {
        // Validate message
        MessageValidator.validate(message);
        
        switch (message.action) {
          case 'updateFilters':
            this.filteredUsernames = new Set(message.usernames);
            this.resetAndRefilter();
            break;
            
          case 'updateShowCount':
            this.showBlockedCount = message.showCount;
            this.updateBadge();
            break;
        }
      } catch (error) {
        console.error('Invalid message received:', error);
      }
    }
    
    filterExistingContent() {
      const elements = this.elementCache.findElementsInNode(document);
      elements.forEach(element => this.filterElement(element));
      this.updateBadge();
    }
    
    filterElement({ link, parent }) {
      // Find username element
      const usernameWrapper = link.querySelector('.fabkit-Typography-ellipsisWrapper');
      if (!usernameWrapper) return;
      
      // Extract and validate username
      const username = usernameWrapper.textContent.trim();
      if (!username) return;
      
      // Check if username is filtered
      const shouldFilter = this.filteredUsernames.has(username);
      const isCurrentlyFiltered = parent.hasAttribute('data-filtered');
      
      if (shouldFilter && !isCurrentlyFiltered) {
        // Filter the element
        parent.setAttribute('data-filtered', 'true');
        this.blockedCount++;
      } else if (!shouldFilter && isCurrentlyFiltered) {
        // Unfilter the element
        parent.removeAttribute('data-filtered');
        this.blockedCount--;
      }
    }
    
    setupMutationObserver() {
      const observer = new MutationObserver((mutations) => {
        // Batch mutations
        for (const mutation of mutations) {
          if (mutation.type !== 'childList') continue;
          
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              this.pendingMutations.add(node);
            }
          }
        }
        
        // Debounce processing
        if (this.pendingMutations.size > 0) {
          if (this.mutationTimeout) {
            clearTimeout(this.mutationTimeout);
          }
          
          this.mutationTimeout = this.resourceManager.setTimeout(() => {
            this.processPendingMutations();
          }, 100);
        }
      });
      
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: false,
        characterData: false
      });
      
      this.resourceManager.setObserver(observer);
    }
    
    processPendingMutations() {
      if (this.pendingMutations.size === 0) return;
      
      // Process in next animation frame for better performance
      requestAnimationFrame(() => {
        const nodesToProcess = Array.from(this.pendingMutations);
        this.pendingMutations.clear();
        
        nodesToProcess.forEach(node => {
          // Check if node is still in DOM
          if (!document.contains(node)) return;
          
          const elements = this.elementCache.findElementsInNode(node);
          elements.forEach(element => this.filterElement(element));
        });
        
        this.updateBadge();
      });
    }
    
    resetAndRefilter() {
      // Reset count
      this.blockedCount = 0;
      
      // Clear cache
      this.elementCache = new ElementCache();
      
      // Remove ALL filtering-related attributes to force reprocessing
      const allProcessed = document.querySelectorAll('[data-filtered-processed="true"]');
      allProcessed.forEach(element => {
        element.removeAttribute('data-filtered');
        element.removeAttribute('data-filtered-processed');
      });
      
      // Also check for elements that only have data-filtered
      const filtered = document.querySelectorAll('[data-filtered="true"]');
      filtered.forEach(element => {
        element.removeAttribute('data-filtered');
        element.removeAttribute('data-filtered-processed');
      });
      
      // Refilter everything
      this.filterExistingContent();
    }
    
    updateBadge() {
      if (this.showBlockedCount) {
        // Show count in badge
        const text = this.blockedCount > 0 ? this.blockedCount.toString() : '';
        this.sendMessageSafely({
          action: 'updateBadge',
          text: text,
          color: this.blockedCount > 0 ? '#f44336' : '#4CAF50'
        });
      } else {
        // Clear badge
        this.sendMessageSafely({
          action: 'updateBadge',
          text: '',
          color: '#4CAF50'
        });
      }
    }
    
    sendMessageSafely(message) {
      try {
        // Check if extension context is still valid
        if (chrome.runtime?.id) {
          chrome.runtime.sendMessage(message).catch(error => {
            // Silently ignore if extension context is invalidated
            if (error.message?.includes('Extension context invalidated')) {
              console.debug('Extension context invalidated, ignoring message');
            } else {
              console.error('Failed to send message:', error);
            }
          });
        }
      } catch (error) {
        // Handle synchronous errors
        if (!error.message?.includes('Extension context invalidated')) {
          console.error('Error sending message:', error);
        }
      }
    }
    
    cleanup() {
      this.resourceManager.cleanup();
    }
  }
  
  // Initialize filter when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      const filter = new FabFilter();
      filter.initialize();
    });
  } else {
    const filter = new FabFilter();
    filter.initialize();
  }