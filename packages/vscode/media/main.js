// @ts-check

(function () {
  const vscode = acquireVsCodeApi();

  // Get DOM elements
  const messagesContainer = document.getElementById('messages');
  const messageInput = document.getElementById('message-input');
  const sendButton = document.getElementById('send-button');
  const thinkingIndicator = document.getElementById('thinking');

  let currentSession = null;

  // Initialize
  document.addEventListener('DOMContentLoaded', () => {
    // Notify extension that webview is ready
    vscode.postMessage({ type: 'ready' });
    
    // Set up event listeners
    setupEventListeners();
  });

  function setupEventListeners() {
    // Send button click
    sendButton.addEventListener('click', sendMessage);

    // Enter key in textarea (Shift+Enter for new line)
    messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Auto-resize textarea
    messageInput.addEventListener('input', () => {
      messageInput.style.height = 'auto';
      messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
    });
  }

  function sendMessage() {
    const message = messageInput.value.trim();
    if (!message) return;

    // Clear input
    messageInput.value = '';
    messageInput.style.height = 'auto';

    // Send to extension
    vscode.postMessage({
      type: 'sendMessage',
      message: message
    });
  }

  function addMessage(message) {
    const messageElement = document.createElement('div');
    messageElement.className = `message ${message.role}`;
    
    const avatar = createAvatar(message.role);
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'message-content-wrapper';
    
    contentWrapper.innerHTML = `
      <div class="message-header">
        <span class="role">${message.role === 'user' ? 'You' : 'Gemini Agent'}</span>
        <span class="timestamp">${formatTimestamp(message.timestamp)}</span>
      </div>
      <div class="message-content">${formatMessageContent(message.content)}</div>
      ${message.toolCalls ? formatToolCalls(message.toolCalls) : ''}
    `;
    
    messageElement.appendChild(avatar);
    messageElement.appendChild(contentWrapper);
    messagesContainer.appendChild(messageElement);
    scrollToBottom();
  }
  
  function createAvatar(role) {
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    
    if (role === 'user') {
      avatar.textContent = 'U';
    } else if (role === 'assistant') {
      avatar.textContent = 'AI';
    } else {
      avatar.textContent = '!';
    }
    
    return avatar;
  }

  function formatMessageContent(content) {
    // Handle undefined or null content
    if (!content || typeof content !== 'string') {
      return 'No response received from CLI';
    }
    
    // Basic markdown-like formatting
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
      .replace(/\n/g, '<br>');
  }

  function formatToolCalls(toolCalls) {
    if (!toolCalls || toolCalls.length === 0) return '';

    const toolCallsHtml = toolCalls.map(toolCall => {
      const status = toolCall.error ? 'error' : 'success';
      const icon = toolCall.error ? '❌' : '✅';
      
      return `
        <div class="tool-call ${status}">
          <div class="tool-call-header">
            <span class="tool-icon">${icon}</span>
            <span class="tool-name">${toolCall.name}</span>
          </div>
          ${toolCall.error ? 
            `<div class="tool-error">${toolCall.error}</div>` : 
            toolCall.result ? `<div class="tool-result">${JSON.stringify(toolCall.result, null, 2)}</div>` : ''
          }
        </div>
      `;
    }).join('');

    return `<div class="tool-calls">${toolCallsHtml}</div>`;
  }

  function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function showThinking(show) {
    if (show) {
      if (thinkingIndicator.classList.contains('hidden')) {
        // Create thinking indicator with avatar
        thinkingIndicator.innerHTML = `
          <div class="thinking-avatar">AI</div>
          <div class="thinking-dots">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <span>Thinking...</span>
        `;
      }
      thinkingIndicator.classList.remove('hidden');
    } else {
      thinkingIndicator.classList.add('hidden');
    }
    scrollToBottom();
  }

  function clearMessages() {
    messagesContainer.innerHTML = '';
  }

  function scrollToBottom() {
    setTimeout(() => {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }, 10);
  }

  function showError(message) {
    const errorElement = document.createElement('div');
    errorElement.className = 'message error';
    
    const avatar = createAvatar('error');
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'message-content-wrapper';
    
    contentWrapper.innerHTML = `
      <div class="message-header">
        <span class="role">Error</span>
        <span class="timestamp">${formatTimestamp(new Date().toISOString())}</span>
      </div>
      <div class="message-content">${message}</div>
    `;
    
    errorElement.appendChild(avatar);
    errorElement.appendChild(contentWrapper);
    messagesContainer.appendChild(errorElement);
    scrollToBottom();
  }

  // Handle messages from the extension
  window.addEventListener('message', event => {
    const message = event.data;

    switch (message.type) {
      case 'userMessage':
        addMessage(message.message);
        break;
      
      case 'assistantMessage':
        addMessage(message.message);
        break;
      
      case 'thinking':
        showThinking(message.thinking);
        break;
      
      case 'error':
        showError(message.message);
        showThinking(false);
        break;
      
      case 'newSession':
        currentSession = message.session;
        clearMessages();
        break;
      
      case 'clearChat':
        clearMessages();
        currentSession = null;
        break;
      
      case 'currentSession':
        currentSession = message.session;
        clearMessages();
        if (currentSession && currentSession.messages) {
          currentSession.messages.forEach(msg => addMessage(msg));
        }
        break;
    }
  });

  // Expose functions for debugging
  window.geminiAgent = {
    sendMessage: (msg) => vscode.postMessage({ type: 'sendMessage', message: msg }),
    newChat: () => vscode.postMessage({ type: 'newChat' }),
    clearChat: () => vscode.postMessage({ type: 'clearChat' })
  };
})();
