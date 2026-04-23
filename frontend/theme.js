// frontend/theme.js - Theme management system
(function () {
  const THEME_KEY = 'chatroom_theme';
  const THEME_ATTRIBUTE = 'data-theme';

  // Theme definitions
  const themes = {
    dark: {
      name: 'Dark',
      icon: 'fa-moon',
      colors: {
        '--bg': '#08080a',
        '--surface': '#121217',
        '--surface2': '#1a1a21',
        '--accent': 'linear-gradient(135deg, #6366f1, #a855f7)',
        '--accent-solid': '#6366f1',
        '--text': '#f8f9fa',
        '--muted': '#8e8e9c',
        '--border': 'rgba(255,255,255,0.08)',
        '--message-other': '#2a2a2a',
        '--input-bg': '#2a2a2a'
      }
    },
    light: {
      name: 'Light',
      icon: 'fa-sun',
      colors: {
        '--bg': '#f8f9fa',
        '--surface': '#ffffff',
        '--surface2': '#f1f3f5',
        '--accent': 'linear-gradient(135deg, #6366f1, #a855f7)',
        '--accent-solid': '#6366f1',
        '--text': '#1a1a1a',
        '--muted': '#6c757d',
        '--border': 'rgba(0,0,0,0.1)',
        '--message-other': '#e9ecef',
        '--input-bg': '#ffffff'
      }
    },
    midnight: {
      name: 'Midnight',
      icon: 'fa-cloud-moon',
      colors: {
        '--bg': '#0a0e27',
        '--surface': '#151932',
        '--surface2': '#1e2144',
        '--accent': 'linear-gradient(135deg, #00d2ff, #3a7bd5)',
        '--accent-solid': '#00d2ff',
        '--text': '#e0e7ff',
        '--muted': '#818cf8',
        '--border': 'rgba(99,102,241,0.2)',
        '--message-other': '#1e2144',
        '--input-bg': '#1e2144'
      }
    }
  };

  // Get saved theme or default to dark
  let currentTheme = localStorage.getItem(THEME_KEY) || 'dark';

  // Apply theme
  function applyTheme(themeName) {
    const theme = themes[themeName] || themes.dark;
    const root = document.documentElement;

    Object.entries(theme.colors).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });

    root.setAttribute(THEME_ATTRIBUTE, themeName);
    localStorage.setItem(THEME_KEY, themeName);
    currentTheme = themeName;

    // Update theme toggle button if exists
    updateThemeToggle();

    // Dispatch event for other components
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: themeName } }));
  }

  // Auth State Management
  let currentUser = null;
  async function checkAuth() {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      currentUser = data.user;
      return currentUser;
    } catch (e) { return null; }
  }

  // Create theme toggle button (now Main Menu)
  function createThemeToggle() {
    let container = document.querySelector('.theme-toggle-container');
    let button = document.querySelector('.menu-btn'); // Look for button in header

    if (!button) {
        // Fallback for pages without header button
        if (container) return;
        container = document.createElement('div');
        container.className = 'theme-toggle-container';
        container.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          z-index: 10000;
          height: 60px;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 70px;
        `;
        button = document.createElement('button');
        button.className = 'menu-btn';
        button.innerHTML = '<i class="fas fa-bars"></i>';
        container.appendChild(button);
        document.body.appendChild(container);
    } else {
        // We found a button in the header, let's wrap it in a container if needed for absolute positioning of menu
        container = button.parentElement;
        if (!container.classList.contains('menu-wrapper')) {
            const wrapper = document.createElement('div');
            wrapper.className = 'menu-wrapper';
            wrapper.style.position = 'relative';
            wrapper.style.height = '100%';
            button.parentNode.insertBefore(wrapper, button);
            wrapper.appendChild(button);
            container = wrapper;
        }
    }

    button.onclick = (e) => {
      e.stopPropagation();
      toggleThemeMenu(e);
    };

    // Create main menu
    const menu = document.createElement('div');
    menu.className = 'theme-menu';
    menu.style.cssText = `
      position: absolute;
      top: 100%;
      left: 0;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 0 0 16px 16px;
      padding: 12px;
      display: none;
      flex-direction: column;
      gap: 6px;
      min-width: 240px;
      backdrop-filter: blur(25px);
      box-shadow: 0 12px 40px rgba(0,0,0,0.3);
      z-index: 20000;
      animation: slideIn 0.3s ease;
    `;

    // Add CSS for slideIn animation if not present
    if (!document.getElementById('menu-animations')) {
      const style = document.createElement('style');
      style.id = 'menu-animations';
      style.textContent = `
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .menu-item {
          padding: 10px 14px;
          background: transparent;
          border: none;
          color: var(--text);
          cursor: pointer;
          border-radius: 10px;
          display: flex;
          align-items: center;
          gap: 12px;
          transition: all 0.2s;
          font-size: 14px;
          width: 100%;
          text-align: left;
        }
        .menu-item:hover {
          background: var(--surface2);
          padding-left: 18px;
        }
        .menu-divider {
          height: 1px;
          background: var(--border);
          margin: 6px 0;
        }
        .menu-label {
          font-size: 11px;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 1px;
          padding: 4px 14px;
          font-weight: 700;
        }
        .menu-btn {
          width: 70px;
          height: 100%;
          background: transparent;
          border: none;
          border-right: 1px solid var(--border);
          color: var(--text);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          transition: all 0.3s ease;
          flex-shrink: 0;
        }
        .menu-btn:hover {
          background: var(--surface2);
        }
      `;
      document.head.appendChild(style);
    }

    // Menu Items
    const createMenuItem = (icon, text, onClick, subtext = '') => {
      const item = document.createElement('button');
      item.className = 'menu-item';
      item.innerHTML = `
        <i class="fas ${icon}" style="width: 18px; text-align: center; color: var(--accent-solid);"></i>
        <div style="display: flex; flex-direction: column;">
          <span>${text}</span>
          ${subtext ? `<span style="font-size: 10px; color: var(--muted); opacity: 0.8;">${subtext}</span>` : ''}
        </div>
      `;
      item.onclick = (e) => {
        e.stopPropagation();
        onClick(e);
        menu.style.display = 'none';
      };
      return item;
    };

    // --- DYNAMIC AUTH SECTION ---
    checkAuth().then(user => {
      menu.innerHTML = ''; // Clear and rebuild based on auth
      
      const label = document.createElement('div');
      label.className = 'menu-label';
      label.textContent = user ? `Hi, ${user.nickname}` : 'Main Menu';
      menu.appendChild(label);

      if (user) {
        // Logged In Options
        menu.appendChild(createMenuItem('fa-user-circle', 'My Profile', () => openProfileModal()));
        menu.appendChild(createMenuItem('fa-users', 'Manage Groups', () => openGroupsModal()));
        menu.appendChild(createMenuItem('fa-sign-out-alt', 'Logout', () => logout()));
      } else {
        // Logged Out Options
        menu.appendChild(createMenuItem('fa-sign-in-alt', 'Login / Register', () => {
          window.location.href = '/auth';
        }));
      }

      menu.appendChild(document.createElement('div')).className = 'menu-divider';

      // Themes
      const themeLabel = document.createElement('div');
      themeLabel.className = 'menu-label';
      themeLabel.textContent = 'Themes';
      menu.appendChild(themeLabel);

      Object.entries(themes).forEach(([id, t]) => {
        const item = createMenuItem(t.icon, t.name, () => applyTheme(id), id === currentTheme ? 'Active' : '');
        if (id === currentTheme) item.style.borderLeft = '2px solid var(--accent-solid)';
        menu.appendChild(item);
      });
    });

    // 3. Location Filter
    const countryStr = localStorage.getItem('user_country');
    const country = countryStr ? JSON.parse(countryStr) : {name: "Global"};
    menu.appendChild(createMenuItem('fa-globe', 'Location Filter', () => {
      alert('Location filtering is active for: ' + country.name);
    }, country.name));

    const divider = document.createElement('div');
    divider.className = 'menu-divider';
    menu.appendChild(divider);

    const themeLabel = document.createElement('div');
    themeLabel.className = 'menu-label';
    themeLabel.textContent = 'Appearance';
    menu.appendChild(themeLabel);

    // Themes
    Object.entries(themes).forEach(([key, theme]) => {
      const option = createMenuItem(theme.icon, theme.name, () => {
        applyTheme(key);
      });
      if (currentTheme === key) {
        option.style.borderLeft = '3px solid var(--accent-solid)';
        option.style.background = 'rgba(99, 102, 241, 0.1)';
      }
      menu.appendChild(option);
    });

    container.appendChild(menu);

    function toggleThemeMenu(e) {
      if (e) e.stopPropagation();
      const isVisible = menu.style.display === 'flex';
      // Close all other menus if any
      document.querySelectorAll('.theme-menu').forEach(m => m.style.display = 'none');
      menu.style.display = isVisible ? 'none' : 'flex';
    }

    document.addEventListener('click', () => {
      menu.style.display = 'none';
    });
    
    // Export toggle for global use
    window.ChatroomTheme.toggleMenu = toggleThemeMenu;
  }

  function updateThemeToggle() {
    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(item => {
      const textDiv = item.querySelector('div span');
      if (!textDiv) return;
      const themeName = textDiv.textContent.trim();
      const themeKey = Object.keys(themes).find(k => themes[k].name === themeName);
      if (themeKey) {
        if (currentTheme === themeKey) {
          item.style.borderLeft = '3px solid var(--accent-solid)';
          item.style.background = 'rgba(99, 102, 241, 0.1)';
        } else {
          item.style.borderLeft = 'none';
          item.style.background = 'transparent';
        }
      }
    });
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.reload();
  }

  function createModal(title, content) {
    const modal = document.createElement('div');
    modal.className = 'custom-modal-overlay';
    modal.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.8); backdrop-filter: blur(8px);
      z-index: 10001; display: flex; align-items: center; justify-content: center;
      animation: fadeIn 0.3s ease;
    `;
    
    modal.innerHTML = `
      <div class="custom-modal-card" style="background: var(--surface); border: 1px solid var(--border); border-radius: 20px; padding: 24px; width: 90%; max-width: 400px; position: relative;">
        <div style="font-size: 20px; font-weight: 800; margin-bottom: 20px; color: var(--text);">${title}</div>
        <div class="modal-body">${content}</div>
        <button class="modal-close" style="position: absolute; top: 20px; right: 20px; background: none; border: none; color: var(--muted); cursor: pointer;"><i class="fas fa-times"></i></button>
      </div>
    `;
    
    document.body.appendChild(modal);
    modal.querySelector('.modal-close').onclick = () => modal.remove();
    return modal;
  }

  window.openProfileModal = async () => {
    const user = await checkAuth();
    if (!user) return;
    
    const content = `
      <div style="display: flex; flex-direction: column; gap: 15px;">
        <div class="form-group">
          <label style="font-size: 11px; color: var(--muted); text-transform: uppercase;">Nickname</label>
          <input type="text" id="p-nickname" value="${user.nickname}" style="width: 100%; background: var(--surface2); border: 1px solid var(--border); border-radius: 10px; padding: 10px; color: var(--text); outline: none;">
        </div>
        <div class="form-group">
          <label style="font-size: 11px; color: var(--muted); text-transform: uppercase;">Phone (Not changeable)</label>
          <div style="padding: 10px; background: var(--surface2); border-radius: 10px; color: var(--muted); font-size: 14px;">${user.phoneNumber}</div>
        </div>
        <button id="save-profile" style="background: var(--accent-solid); color: white; border: none; border-radius: 10px; padding: 12px; font-weight: 700; cursor: pointer; margin-top: 10px;">Save Changes</button>
      </div>
    `;
    
    const modal = createModal('User Profile', content);
    modal.querySelector('#save-profile').onclick = async () => {
      const nickname = modal.querySelector('#p-nickname').value;
      const res = await fetch('/api/profile/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname })
      });
      if (res.ok) {
        alert('Profile updated!');
        modal.remove();
        window.location.reload();
      }
    };
  };

  window.openGroupsModal = async () => {
    const res = await fetch('/api/groups/my');
    const { groups } = await res.json();
    
    const groupsList = groups.map(g => `
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px; background: var(--surface2); border-radius: 12px; margin-bottom: 8px;">
        <div>
          <div style="font-weight: 700; color: var(--text);">${g.name}</div>
          <div style="font-size: 10px; color: var(--muted);">Code: ${g.inviteCode}</div>
        </div>
        <button onclick="window.joinGroupChat('${g.id}', '${g.name}')" style="background: var(--accent-solid); color: white; border: none; border-radius: 8px; padding: 6px 12px; font-size: 12px; cursor: pointer;">Enter</button>
      </div>
    `).join('') || '<div style="color: var(--muted); text-align: center; padding: 20px;">No groups yet</div>';
    
    const content = `
      <div style="display: flex; flex-direction: column; gap: 20px;">
        <div style="max-height: 200px; overflow-y: auto;">${groupsList}</div>
        <div style="height: 1px; background: var(--border);"></div>
        <div style="display: flex; gap: 10px;">
          <input type="text" id="g-name" placeholder="Group Name" style="flex: 1; background: var(--surface2); border: 1px solid var(--border); border-radius: 10px; padding: 10px; color: var(--text); outline: none;">
          <button id="create-group" style="background: #10b981; color: white; border: none; border-radius: 10px; padding: 10px 15px; font-weight: 700; cursor: pointer;">Create</button>
        </div>
        <div style="display: flex; gap: 10px;">
          <input type="text" id="g-code" placeholder="Invite Code" style="flex: 1; background: var(--surface2); border: 1px solid var(--border); border-radius: 10px; padding: 10px; color: var(--text); outline: none;">
          <button id="join-group" style="background: #3b82f6; color: white; border: none; border-radius: 10px; padding: 10px 15px; font-weight: 700; cursor: pointer;">Join</button>
        </div>
      </div>
    `;
    
    const modal = createModal('Group Chats', content);
    
    modal.querySelector('#create-group').onclick = async () => {
      const name = modal.querySelector('#g-name').value;
      if (!name) return;
      const res = await fetch('/api/groups/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (res.ok) window.location.reload();
    };
    
    modal.querySelector('#join-group').onclick = async () => {
      const inviteCode = modal.querySelector('#g-code').value;
      if (!inviteCode) return;
      const res = await fetch('/api/groups/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteCode })
      });
      if (res.ok) window.location.reload();
    };
  };

  // Global window function for entering group chat
  window.joinGroupChat = (groupId, groupName) => {
    // Hide modal
    const modal = document.querySelector('.custom-modal-overlay');
    if (modal) modal.remove();
    
    // Trigger socket join in chat.html context
    if (window.onGroupSwitch) {
      window.onGroupSwitch(groupId, groupName);
    } else {
      // If on index page, redirect to chat with group param
      sessionStorage.setItem('pendingGroup', JSON.stringify({ id: groupId, name: groupName }));
      window.location.href = '/chat';
    }
  };

  // Initialize theme system
  function initTheme() {
    applyTheme(currentTheme);
    createThemeToggle();

    // Add Font Awesome if not present
    if (!document.querySelector('link[href*="font-awesome"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
      document.head.appendChild(link);
    }
  }

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTheme);
  } else {
    initTheme();
  }

  // Export for global use
  window.ChatroomTheme = {
    apply: applyTheme,
    getCurrent: () => currentTheme,
    themes: Object.keys(themes),
    toggleMenu: null // Will be set in createThemeToggle
  };
})();