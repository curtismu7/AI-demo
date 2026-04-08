import { useEffect, useState } from 'react';

const useChatWidget = () => {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // index.html only calls initializeChatWidget on localhost; hosted builds use React BankingAgent.
    const isLocalhost =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    if (!isLocalhost) {
      setIsInitialized(true);
      return;
    }

    const checkForWidget = () => {
      if (window.bankingWidget) {
        setIsInitialized(true);
        return true;
      }
      return false;
    };

    if (checkForWidget()) {
      return;
    }

    const interval = setInterval(() => {
      if (checkForWidget()) {
        clearInterval(interval);
      }
    }, 100);

    const timeout = setTimeout(() => {
      clearInterval(interval);
      console.warn('Banking chat widget not found after 10 seconds (localhost only)');
    }, 10000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, []);

  // Return widget control methods that use the global widget
  return {
    open: () => {
      
      if (window.bankingWidget) {
        try {
          // Check DOM before opening
          
          window.bankingWidget.open();
          
          // Check DOM after opening
          setTimeout(() => {
            const chatWidgets = document.querySelectorAll('[id*="chat"]');
            const bankingWidgets = document.querySelectorAll('[id*="banking"]');
            const allWidgets = document.querySelectorAll('[class*="widget"], [id*="widget"]');
            
            // Inspect each widget element in detail
            [...chatWidgets, ...bankingWidgets, ...allWidgets].forEach((el, index) => {
              const styles = window.getComputedStyle(el);
              
              // Try to make it visible and positioned
              if (el.id.includes('banking') || el.id.includes('chat')) {
                el.style.position = 'fixed';
                el.style.bottom = '20px';
                el.style.right = '20px';
                el.style.zIndex = '10000';
                el.style.display = 'block';
                el.style.visibility = 'visible';
                el.style.opacity = '1';
                el.style.width = '350px';
                el.style.height = '500px';
                el.style.backgroundColor = 'white';
                el.style.border = '2px solid #007bff';
                el.style.borderRadius = '12px';
                el.style.boxShadow = '0 8px 32px rgba(0,0,0,0.2)';
              }
            });
            
            // Check for elements with high z-index that might be covering
            const highZElements = Array.from(document.querySelectorAll('*')).filter(el => {
              const zIndex = window.getComputedStyle(el).zIndex;
              return zIndex && parseInt(zIndex) > 1000;
            });
            
            // Look for any elements that might be the chat widget
            const possibleWidgets = document.querySelectorAll('div[style*="position: fixed"], div[style*="position: absolute"]');
          }, 100);
          
        } catch (error) {
          console.error('Error opening chat widget:', error);
        }
      } else {
        console.warn('Banking chat widget not available');
        // Try to initialize if the function exists but widget wasn't created
        if (window.initBankingChatWidget) {
          try {
            const widget = window.initBankingChatWidget({
              apiUrl: 'ws://localhost:8082/ws',
              position: 'bottom-right',
              theme: 'light',
              title: 'AI Banking Assistant',
              autoOpen: true // Open immediately when created
            });
            window.bankingWidget = widget;
            setIsInitialized(true);
          } catch (error) {
            console.error('Failed to initialize widget:', error);
          }
        }
      }
    },
    close: () => {
      if (window.bankingWidget) {
        try {
          window.bankingWidget.close();
        } catch (error) {
          console.error('Error closing chat widget:', error);
        }
      } else {
        console.warn('Banking chat widget not available');
      }
    },
    destroy: () => {
      if (window.bankingWidget) {
        try {
          window.bankingWidget.destroy();
          window.bankingWidget = null;
          setIsInitialized(false);
        } catch (error) {
          console.error('Error destroying chat widget:', error);
        }
      }
    },
    isInitialized: () => isInitialized
  };
};

export default useChatWidget;