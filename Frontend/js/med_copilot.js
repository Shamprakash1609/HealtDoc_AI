document.addEventListener('DOMContentLoaded', () => {
    const chatForm = document.getElementById('chat-form');
    const chatTextarea = document.getElementById('chat-textarea');
    const sendBtn = document.getElementById('send-btn');
    const chatHistory = document.getElementById('chat-history');
    const suggestionsWrapper = document.getElementById('suggestions-wrapper');

    let isGenerating = false;

    // Auto-resize textarea
    chatTextarea.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';

        // Enable/Disable send button based on input
        if (this.value.trim() !== '') {
            sendBtn.style.opacity = '1';
        } else {
            sendBtn.style.opacity = '0.7';
        }
    });

    // Handle Enter key (Send on Enter, Newline on Shift+Enter)
    chatTextarea.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!isGenerating && this.value.trim() !== '') {
                chatForm.dispatchEvent(new Event('submit'));
            }
        }
    });

    // Suggestion Pill Click Handlers
    function attachSuggestionListeners() {
        const pills = document.querySelectorAll('.suggestion-pill');
        pills.forEach(pill => {
            pill.addEventListener('click', () => {
                if (isGenerating) return;
                const text = pill.textContent;
                chatTextarea.value = text;
                chatTextarea.style.height = 'auto';
                chatForm.dispatchEvent(new Event('submit'));
            });
        });
    }

    // Initial setup
    attachSuggestionListeners();

    // Chat Form Submit
    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const query = chatTextarea.value.trim();
        if (!query || isGenerating) return;

        // Reset input
        chatTextarea.value = '';
        chatTextarea.style.height = '50px'; // Reset height approximation

        // 1. Render User Bubble
        renderUserBubble(query);
        scrollToBottom();

        // 2. Render Loading Bubble
        isGenerating = true;
        setUIState(true);
        const typingIndicator = renderTypingIndicator();
        scrollToBottom();

        try {
            // 3. Call API
            const response = await fetch('http://127.0.0.1:8000/medical/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ query: query })
            });

            if (!response.ok) {
                throw new Error(`Server returned ${response.status}`);
            }

            const data = await response.json();

            // 4. Remove Typing Indicator
            typingIndicator.remove();

            // 5. Render AI Bubble
            renderAIBubble(data.answer);

            // 6. Update Suggestions
            if (data.suggestions && data.suggestions.length > 0) {
                updateSuggestions(data.suggestions);
            } else {
                // If API didn't provide suggestions, clear them or keep old
                suggestionsWrapper.innerHTML = '';
            }

            scrollToBottom();

        } catch (error) {
            console.error('Chat API Error:', error);
            typingIndicator.remove();
            renderAIBubble("**I'm sorry, an error occurred while connecting to my intelligence systems.** Please ensure the backend server is running and try again.");
            scrollToBottom();
        } finally {
            isGenerating = false;
            setUIState(false);
            chatTextarea.focus();
        }
    });

    // --- Helper UI Functions ---

    function renderUserBubble(text) {
        const bubble = document.createElement('div');
        bubble.className = 'chat-bubble user-bubble';

        // Simple text node for user (no markdown required for user input)
        const textNode = document.createTextNode(text);

        bubble.innerHTML = `
            <div class="bubble-avatar">
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="var(--color-text)">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                </svg>
            </div>
            <div class="bubble-content user-input-content"></div>
        `;

        // Append text safely to prevent XSS
        bubble.querySelector('.bubble-content').appendChild(textNode);
        chatHistory.appendChild(bubble);
    }

    function renderAIBubble(markdownText) {
        const bubble = document.createElement('div');
        bubble.className = 'chat-bubble ai-bubble';

        // Parse markdown 
        const parsedHTML = marked.parse(markdownText);

        bubble.innerHTML = `
            <div class="bubble-avatar">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect width="24" height="24" rx="6" fill="#2ABFFF" />
                    <circle cx="12" cy="12" r="5" fill="white" />
                </svg>
            </div>
            <div class="bubble-content markdown-rendered">${parsedHTML}</div>
        `;

        // Make links open in new tab
        const links = bubble.querySelectorAll('a');
        links.forEach(link => {
            link.setAttribute('target', '_blank');
            link.setAttribute('rel', 'noopener noreferrer');
        });

        chatHistory.appendChild(bubble);
    }

    function renderTypingIndicator() {
        const bubble = document.createElement('div');
        bubble.className = 'chat-bubble ai-bubble typing-bubble';
        bubble.innerHTML = `
            <div class="bubble-avatar">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect width="24" height="24" rx="6" fill="#2ABFFF" />
                    <circle cx="12" cy="12" r="5" fill="white" />
                </svg>
            </div>
            <div class="bubble-content" style="padding: 12px 24px;">
                <div class="typing-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
        `;
        chatHistory.appendChild(bubble);
        return bubble;
    }

    function updateSuggestions(suggestionsArray) {
        // Clear old
        suggestionsWrapper.innerHTML = '';

        suggestionsArray.slice(0, 3).forEach(suggestion => {
            const btn = document.createElement('button');
            btn.className = 'suggestion-pill';
            btn.textContent = suggestion;
            suggestionsWrapper.appendChild(btn);
        });

        // Reattach listeners
        attachSuggestionListeners();
    }

    function scrollToBottom() {
        chatHistory.scrollTo({
            top: chatHistory.scrollHeight,
            behavior: 'smooth'
        });
    }

    function setUIState(disabled) {
        chatTextarea.disabled = disabled;
        sendBtn.disabled = disabled;

        if (disabled) {
            chatTextarea.style.opacity = '0.5';
            const pills = document.querySelectorAll('.suggestion-pill');
            pills.forEach(p => p.style.pointerEvents = 'none');
        } else {
            chatTextarea.style.opacity = '1';
            const pills = document.querySelectorAll('.suggestion-pill');
            pills.forEach(p => p.style.pointerEvents = 'auto');
        }
    }
});
