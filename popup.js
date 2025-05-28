// Storage keys
const STORAGE_KEYS = {
    usernames: 'filteredUsernames',
    showCount: 'showBlockedCount'
  };
  
  // Memory leak prevention manager
  class ResourceManager {
    constructor() {
      this.listeners = [];
      this.timers = [];
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
    
    cleanup() {
      // Remove all event listeners
      this.listeners.forEach(({ element, event, handler, options }) => {
        element.removeEventListener(event, handler, options);
      });
      
      // Clear all timers
      this.timers.forEach(timer => clearTimeout(timer));
      
      // Clear arrays
      this.listeners = [];
      this.timers = [];
    }
  }
  
  const resourceManager = new ResourceManager();
  
  // Input sanitization
  class InputValidator {
    static sanitizeUsername(username) {
      if (typeof username !== 'string') {
        throw new Error('Username must be a string');
      }
      
      // Trim whitespace
      username = username.trim();
      
      // Check if empty
      if (!username) {
        throw new Error('Username cannot be empty');
      }
      
      // Check length
      const maxLength = 100;
      if (username.length > maxLength) {
        throw new Error(`Username cannot exceed ${maxLength} characters`);
      }
      
      // Validate characters (alphanumeric, underscore, hyphen, dot, space)
      const validPattern = /^[a-zA-Z0-9_\-\. ]+$/;
      if (!validPattern.test(username)) {
        throw new Error('Username can only contain letters, numbers, underscores, hyphens, spaces, and dots');
      }
      
      return username;
    }
    
    static sanitizeJSON(jsonString) {
      try {
        const parsed = JSON.parse(jsonString);
        
        // Validate structure
        if (!parsed || typeof parsed !== 'object') {
          throw new Error('Invalid JSON structure');
        }
        
        if (!Array.isArray(parsed.usernames)) {
          throw new Error('JSON must contain a usernames array');
        }
        
        // Validate and sanitize each username
        const sanitizedUsernames = parsed.usernames
          .filter(u => typeof u === 'string')
          .map(u => this.sanitizeUsername(u));
        
        return { usernames: sanitizedUsernames };
      } catch (error) {
        if (error instanceof SyntaxError) {
          throw new Error('Invalid JSON format');
        }
        throw error;
      }
    }
  }
  
  // DOM elements
  const usernameInput = document.getElementById('usernameInput');
  const addButton = document.getElementById('addButton');
  const usernameList = document.getElementById('usernameList');
  const emptyMessage = document.getElementById('emptyMessage');
  const clearButton = document.getElementById('clearButton');
  const exportButton = document.getElementById('exportButton');
  const importButton = document.getElementById('importButton');
  const fileInput = document.getElementById('fileInput');
  const showCountCheckbox = document.getElementById('showCountCheckbox');
  const status = document.getElementById('status');
  const inputError = document.getElementById('inputError');
  const usernameCount = document.getElementById('usernameCount');
  
  // Initialize
  initialize();
  
  async function initialize() {
    await loadData();
    setupEventListeners();
  }
  
  // Setup event listeners with proper cleanup
  function setupEventListeners() {
    resourceManager.addEventListener(addButton, 'click', addUsername);
    resourceManager.addEventListener(usernameInput, 'keypress', handleKeyPress);
    resourceManager.addEventListener(usernameInput, 'input', clearInputError);
    resourceManager.addEventListener(clearButton, 'click', clearAll);
    resourceManager.addEventListener(exportButton, 'click', exportList);
    resourceManager.addEventListener(importButton, 'click', () => fileInput.click());
    resourceManager.addEventListener(fileInput, 'change', importList);
    resourceManager.addEventListener(showCountCheckbox, 'change', saveShowCountSetting);
  }
  
  // Handle keypress events
  function handleKeyPress(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addUsername();
    }
  }
  
  // Clear input error message
  function clearInputError() {
    inputError.textContent = '';
  }
  
  // Load saved data
  async function loadData() {
    try {
      const data = await chrome.storage.sync.get([STORAGE_KEYS.usernames, STORAGE_KEYS.showCount]);
      const usernames = data[STORAGE_KEYS.usernames] || [];
      const showCount = data[STORAGE_KEYS.showCount] || false;
      
      showCountCheckbox.checked = showCount;
      renderUsernames(usernames);
    } catch (error) {
      console.error('Failed to load data:', error);
      showStatus('Failed to load saved data', 'error');
    }
  }
  
  // Add username with validation
  async function addUsername() {
    clearInputError();
    
    try {
      // Validate and sanitize input
      const username = InputValidator.sanitizeUsername(usernameInput.value);
      
      // Get current usernames
      const data = await chrome.storage.sync.get(STORAGE_KEYS.usernames);
      const usernames = data[STORAGE_KEYS.usernames] || [];
      
      // Check for duplicates
      if (usernames.includes(username)) {
        showInputError('Username already in filter list');
        return;
      }
      
      // Add username
      usernames.push(username);
      await chrome.storage.sync.set({ [STORAGE_KEYS.usernames]: usernames });
      
      // Update UI
      renderUsernames(usernames);
      usernameInput.value = '';
      showStatus('Username added to filter', 'success');
      
      // Notify content script
      await notifyContentScript({ action: 'updateFilters', usernames });
    } catch (error) {
      showInputError(error.message);
    }
  }
  
  // Show input error
  function showInputError(message) {
    inputError.textContent = message;
  }
  
  // Remove username
  async function removeUsername(username) {
    try {
      const data = await chrome.storage.sync.get(STORAGE_KEYS.usernames);
      const usernames = data[STORAGE_KEYS.usernames] || [];
      
      const index = usernames.indexOf(username);
      if (index > -1) {
        usernames.splice(index, 1);
        await chrome.storage.sync.set({ [STORAGE_KEYS.usernames]: usernames });
        renderUsernames(usernames);
        showStatus('Username removed from filter', 'success');
        
        // Notify content script
        await notifyContentScript({ action: 'updateFilters', usernames });
      }
    } catch (error) {
      console.error('Failed to remove username:', error);
      showStatus('Failed to remove username', 'error');
    }
  }
  
  // Clear all usernames
  async function clearAll() {
    if (!confirm('Are you sure you want to clear all filtered usernames?')) {
      return;
    }
    
    try {
      await chrome.storage.sync.set({ [STORAGE_KEYS.usernames]: [] });
      renderUsernames([]);
      showStatus('All filters cleared', 'success');
      
      // Notify content script
      await notifyContentScript({ action: 'updateFilters', usernames: [] });
    } catch (error) {
      console.error('Failed to clear filters:', error);
      showStatus('Failed to clear filters', 'error');
    }
  }
  
  // Export list as JSON
  async function exportList() {
    try {
      const data = await chrome.storage.sync.get(STORAGE_KEYS.usernames);
      const usernames = data[STORAGE_KEYS.usernames] || [];
      
      const jsonData = JSON.stringify({ usernames }, null, 2);
      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `fab-filter-usernames-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      
      // Clean up
      resourceManager.setTimeout(() => URL.revokeObjectURL(url), 100);
      
      showStatus('Filter list exported', 'success');
    } catch (error) {
      console.error('Failed to export:', error);
      showStatus('Failed to export filter list', 'error');
    }
  }
  
  // Import list from JSON
  async function importList(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      const data = InputValidator.sanitizeJSON(text);
      
      // Remove duplicates
      const uniqueUsernames = [...new Set(data.usernames)];
      
      await chrome.storage.sync.set({ [STORAGE_KEYS.usernames]: uniqueUsernames });
      renderUsernames(uniqueUsernames);
      showStatus(`Imported ${uniqueUsernames.length} usernames`, 'success');
      
      // Notify content script
      await notifyContentScript({ action: 'updateFilters', usernames: uniqueUsernames });
    } catch (error) {
      console.error('Import error:', error);
      showStatus(error.message || 'Failed to import file', 'error');
    }
    
    // Reset file input
    fileInput.value = '';
  }
  
  // Save show count setting
  async function saveShowCountSetting() {
    try {
      const showCount = showCountCheckbox.checked;
      await chrome.storage.sync.set({ [STORAGE_KEYS.showCount]: showCount });
      
      // Notify content script
      await notifyContentScript({ action: 'updateShowCount', showCount });
    } catch (error) {
      console.error('Failed to save setting:', error);
      showStatus('Failed to save setting', 'error');
    }
  }
  
  // Render username list (XSS safe)
  function renderUsernames(usernames) {
    // Clear existing content
    usernameList.innerHTML = '';
    
    // Update count
    usernameCount.textContent = usernames.length;
    
    if (usernames.length === 0) {
      emptyMessage.classList.add('show');
      return;
    }
    
    emptyMessage.classList.remove('show');
    
    // Create elements safely
    usernames.forEach(username => {
      const item = createUsernameElement(username);
      usernameList.appendChild(item);
    });
  }
  
  // Create username element (XSS safe)
  function createUsernameElement(username) {
    const item = document.createElement('div');
    item.className = 'username-item';
    
    const text = document.createElement('span');
    text.className = 'username-text';
    text.textContent = username; // Safe: textContent prevents XSS
    
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = 'Remove';
    removeBtn.type = 'button';
    
    // Use data attribute instead of closure
    removeBtn.dataset.username = username;
    resourceManager.addEventListener(removeBtn, 'click', handleRemoveClick);
    
    item.appendChild(text);
    item.appendChild(removeBtn);
    
    return item;
  }
  
  // Handle remove button clicks
  function handleRemoveClick(e) {
    const username = e.target.dataset.username;
    removeUsername(username);
  }
  
  // Show status message
  let statusTimer = null;
  function showStatus(message, type) {
    // Clear previous timer
    if (statusTimer) {
      clearTimeout(statusTimer);
    }
    
    status.textContent = message;
    status.className = `status show ${type}`;
    
    statusTimer = resourceManager.setTimeout(() => {
      status.classList.remove('show');
      statusTimer = null;
    }, 3000);
  }
  
  // Notify content script with validation
  async function notifyContentScript(message) {
    try {
      // Validate message structure
      if (!message || typeof message !== 'object' || !message.action) {
        throw new Error('Invalid message format');
      }
      
      // Check if extension context is still valid
      if (!chrome.runtime?.id) {
        console.debug('Extension context no longer valid');
        return;
      }
      
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url && tab.url.includes('fab.com')) {
        try {
          await chrome.tabs.sendMessage(tab.id, message);
        } catch (error) {
          // Handle extension context invalidated error gracefully
          if (error.message?.includes('Extension context invalidated') || 
              error.message?.includes('Could not establish connection')) {
            console.debug('Could not notify content script - page may need refresh');
          } else {
            throw error;
          }
        }
      }
    } catch (error) {
      // Only log non-expected errors
      if (!error.message?.includes('Extension context invalidated') &&
          !error.message?.includes('Could not establish connection')) {
        console.error('Failed to notify content script:', error);
      }
    }
  }
  
  // Cleanup on unload
  window.addEventListener('unload', () => {
    resourceManager.cleanup();
  });