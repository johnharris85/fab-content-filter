// Message validator for secure communication
class MessageValidator {
    static validate(message) {
        const allowedActions = ['updateBadge'];

        if (!message || typeof message !== 'object') {
            throw new Error('Invalid message format');
        }

        if (!allowedActions.includes(message.action)) {
            throw new Error('Invalid action');
        }

        switch (message.action) {
            case 'updateBadge':
                if (typeof message.text !== 'string') {
                    throw new Error('Invalid badge text');
                }
                if (message.color && typeof message.color !== 'string') {
                    throw new Error('Invalid badge color');
                }
                break;
        }

        return true;
    }
}

// Badge state management per tab
const tabBadgeStates = new Map();

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
        // Validate message
        MessageValidator.validate(message);

        if (message.action === 'updateBadge' && sender.tab) {
            updateBadgeForTab(sender.tab.id, message.text, message.color);
        }
    } catch (error) {
        console.error('Invalid message received:', error);
    }
});

// Update badge for specific tab
function updateBadgeForTab(tabId, text, color) {
    // Store state for this tab
    tabBadgeStates.set(tabId, { text, color });

    // Update badge
    chrome.action.setBadgeText({
        text: text,
        tabId: tabId
    });

    if (color) {
        chrome.action.setBadgeBackgroundColor({
            color: color,
            tabId: tabId
        });
    }
}

// Clean up when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
    tabBadgeStates.delete(tabId);
});

// Handle tab updates (navigation)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'loading' && !tab.url?.includes('fab.com')) {
        // Clear badge when navigating away from fab.com
        chrome.action.setBadgeText({
            text: '',
            tabId: tabId
        });
        tabBadgeStates.delete(tabId);
    }
});

// Initialize badge on extension install/update
chrome.runtime.onInstalled.addListener(() => {
    // Set default badge color
    chrome.action.setBadgeBackgroundColor({
        color: '#f44336'
    });
});