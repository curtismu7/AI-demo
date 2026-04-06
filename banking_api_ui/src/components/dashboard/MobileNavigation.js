// banking_api_ui/src/components/dashboard/MobileNavigation.js
import React from 'react';
import './MobileNavigation.css';

const MobileNavigation = ({ 
  activeTab, 
  onTabChange, 
  isAuthenticated, 
  currentVertical 
}) => {
  const getNavItems = () => {
    const baseItems = [
      {
        id: 'home',
        label: 'Home',
        icon: '🏠',
        alwaysVisible: true
      },
      {
        id: 'accounts',
        label: 'Accounts',
        icon: '💳',
        alwaysVisible: true
      },
      {
        id: 'agent',
        label: 'AI',
        icon: '🤖',
        alwaysVisible: true
      },
      {
        id: 'more',
        label: 'More',
        icon: '⋯',
        alwaysVisible: true
      }
    ];

    // Add vertical-specific items if needed
    if (currentVertical?.id === 'retail') {
      baseItems.splice(2, 0, {
        id: 'sales',
        label: 'Sales',
        icon: '📊',
        alwaysVisible: false
      });
    } else if (currentVertical?.id === 'workforce') {
      baseItems.splice(2, 0, {
        id: 'employees',
        label: 'Staff',
        icon: '👥',
        alwaysVisible: false
      });
    }

    return baseItems;
  };

  const navItems = getNavItems();

  return (
    <nav className="mobile-navigation">
      <div className="mobile-navigation__container">
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`mobile-navigation__item ${activeTab === item.id ? 'mobile-navigation__item--active' : ''}`}
            onClick={() => onTabChange(item.id)}
            aria-label={item.label}
            aria-current={activeTab === item.id ? 'page' : undefined}
          >
            <span className="mobile-navigation__icon">
              {item.icon}
            </span>
            <span className="mobile-navigation__label">
              {item.label}
            </span>
          </button>
        ))}
      </div>
    </nav>
  );
};

export default MobileNavigation;
