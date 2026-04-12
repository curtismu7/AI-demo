import React, { useState, useRef, useEffect } from 'react';
import { MdPerson, MdSettings, MdNotifications, MdLogout, MdArrowDropDown } from 'react-icons/md';
import './UserMenu.css';

export default function UserMenu({ user, onLogout }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    setIsOpen(false);
    onLogout();
  };

  return (
    <div className="user-menu" ref={menuRef}>
      <button
        className="user-menu-trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="User menu"
        type="button"
      >
        <div className="user-menu-avatar">
          {(user?.firstName?.[0] || '?').toUpperCase()}
        </div>
        <MdArrowDropDown className="user-menu-dropdown-icon" />
      </button>

      {isOpen && (
        <div className="user-menu-dropdown">
          <div className="user-menu-header">
            <div className="user-menu-avatar user-menu-avatar-large">
              {(user?.firstName?.[0] || '?').toUpperCase()}
            </div>
            <div className="user-menu-info">
              <div className="user-menu-name">
                {user?.firstName} {user?.lastName}
              </div>
              <div className="user-menu-email">{user?.email || ''}</div>
              <div className="user-menu-role">
                {user?.role === 'admin' ? '👑 Admin' : '👤 Customer'}
              </div>
            </div>
          </div>

          <div className="user-menu-divider"></div>

          <div className="user-menu-items">
            <button className="user-menu-item" type="button">
              <MdPerson className="user-menu-item-icon" />
              <span>Profile</span>
            </button>
            <button className="user-menu-item" type="button">
              <MdNotifications className="user-menu-item-icon" />
              <span>Notifications</span>
              <span className="user-menu-badge">3</span>
            </button>
            <button className="user-menu-item" type="button">
              <MdSettings className="user-menu-item-icon" />
              <span>Settings</span>
            </button>
          </div>

          <div className="user-menu-divider"></div>

          <button className="user-menu-item user-menu-item-danger" onClick={handleLogout} type="button">
            <MdLogout className="user-menu-item-icon" />
            <span>Logout</span>
          </button>
        </div>
      )}
    </div>
  );
}
