import React, { useState, useEffect, useCallback } from 'react';
import ChatInterface from './ChatInterface';
import './ChatWidget.css';

const ChatWidget = ({
    isOpen = false,
    onToggle,
    position = 'bottom-right',
    theme = 'light',
    title = 'AI Banking Assistant',
    minimized = false,
    apiUrl = 'ws://localhost:8082/ws',
    onDashboardRefresh
}) => {
    const [isMinimized, setIsMinimized] = useState(minimized);
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

    const handleMinimize = () => {
        setIsMinimized(!isMinimized);
    };

    const handleClose = () => {
        if (onToggle) onToggle(false);
    };

    const handleMouseDown = (e) => {
        setIsDragging(true);
        const rect = e.currentTarget.getBoundingClientRect();
        setDragOffset({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        });
    };

    const handleMouseMove = useCallback(
        (e) => {
            const widget = document.querySelector('.chat-widget');
            if (widget) {
                widget.style.left = `${e.clientX - dragOffset.x}px`;
                widget.style.top = `${e.clientY - dragOffset.y}px`;
                widget.style.position = 'fixed';
            }
        },
        [dragOffset]
    );

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    useEffect(() => {
        if (!isDragging) return undefined;
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, handleMouseMove, handleMouseUp]);

    if (!isOpen) return null;

    return (
        <div className={`chat-widget chat-widget--${position} chat-widget--${theme} ${isMinimized ? 'chat-widget--minimized' : ''}`}>
            <div className="chat-widget__header" onMouseDown={handleMouseDown}>
                <div className="chat-widget__title">
                    <span className="chat-widget__icon">💬</span>
                    {title}
                </div>
                <div className="chat-widget__controls">
                    <button
                        className="chat-widget__control-btn chat-widget__minimize"
                        onClick={handleMinimize}
                        title={isMinimized ? 'Expand' : 'Minimize'}
                    >
                        {isMinimized ? '□' : '−'}
                    </button>
                    <button
                        className="chat-widget__control-btn chat-widget__close"
                        onClick={handleClose}
                        title="Close"
                    >
                        ×
                    </button>
                </div>
            </div>

            {!isMinimized && (
                <div className="chat-widget__content">
                    <ChatInterface apiUrl={apiUrl} onDashboardRefresh={onDashboardRefresh} />
                </div>
            )}
        </div>
    );
};

export default ChatWidget;