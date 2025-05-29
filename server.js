const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const app = express();
const PORT = 3000;

// Middleware
app.use(bodyParser.json());
app.use(session({
  secret: 'portfolio_secret_key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

// File paths
const USERS_FILE = 'data/users.json';
const PROJECTS_FILE = 'data/projects.json';
const MESSAGES_FILE = 'data/messages.json';

// Ensure data directory and files exist
const setupDataFiles = () => {
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
  }

  const files = {
    [USERS_FILE]: [],
    [PROJECTS_FILE]: [],
    [MESSAGES_FILE]: []
  };

  Object.entries(files).forEach(([file, defaultContent]) => {
    const filePath = path.join(__dirname, file);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(defaultContent, null, 2));
    }
  });
};

setupDataFiles();

// Authentication middleware
function isAuthenticated(req, res, next) {
  if (req.session.user) {
    next();
  } else {
    res.redirect('/');
  }
}

// Admin middleware
function isAdmin(req, res, next) {
  if (req.session.user && req.session.user.role === 'admin') {
    next();
  } else {
    res.status(403).send('Access denied');
  }
}

// ---------- Routes ----------

// Serve login page at root
app.get('/', (req, res) => {
  if (req.session.user) {
    res.redirect('/public/index.html');
  } else {
    res.sendFile(path.join(__dirname, 'auth/login.html'));
  }
});

// Serve register page
app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'auth/register.html'));
});

// Login handler
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  // Validate input
  if (!username || !password) {
    return res.status(400).json({ message: "Username and password are required" });
  }

  fs.readFile(USERS_FILE, (err, data) => {
    if (err) {
      console.error('Error reading users file:', err);
      return res.status(500).json({ message: "Server error" });
    }

    try {
      const users = JSON.parse(data);
      const user = users.find(u => u.username === username && u.password === password);

      if (user) {
        // Save user data in session
        req.session.user = {
          id: user.id,
          username: user.username,
          role: user.role
        };
        // Save session before redirecting
        req.session.save((err) => {
          if (err) {
            console.error('Session save error:', err);
            return res.status(500).json({ message: "Session error" });
          }
          return res.json({ message: "Login successful" });
        });
      } else {
        res.status(401).json({ message: "Invalid credentials" });
      }
    } catch (error) {
      console.error('Error parsing users file:', error);
      res.status(500).json({ message: "Server error" });
    }
  });
});

// Logout handler
app.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).send("Error logging out");
    res.send("Logged out successfully");
  });
});

// Register handler with extended user data
app.post('/register', (req, res) => {
  const { username, password, email, fullName } = req.body;
  fs.readFile(USERS_FILE, (err, data) => {
    const users = err ? [] : JSON.parse(data);
    if (users.find(u => u.username === username)) {
      return res.status(400).send("User already exists");
    }

    const newUser = {
      username,
      password,
      email,
      fullName,
      role: 'user',
      profile: {
        email,
        fullName,
        bio: '',
        skills: [],
        socialLinks: {},
        createdAt: new Date().toISOString()
      }
    };

    users.push(newUser);
    fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), err => {
      if (err) return res.status(500).send("Error saving user");
      res.status(200).send("User registered successfully");
    });
  });
});

// Profile routes
app.get('/api/profile', isAuthenticated, (req, res) => {
  fs.readFile(USERS_FILE, (err, data) => {
    if (err) return res.status(500).send("Server error");
    const users = JSON.parse(data);
    const user = users.find(u => u.username === req.session.user.username);
    if (user) {
      res.json(user.profile);
    } else {
      res.status(404).send("Profile not found");
    }
  });
});

app.put('/api/profile', isAuthenticated, (req, res) => {
  const updatedProfile = req.body;
  fs.readFile(USERS_FILE, (err, data) => {
    if (err) return res.status(500).send("Server error");
    let users = JSON.parse(data);
    const userIndex = users.findIndex(u => u.username === req.session.user.username);
    
    if (userIndex !== -1) {
      users[userIndex].profile = {
        ...users[userIndex].profile,
        ...updatedProfile,
        updatedAt: new Date().toISOString()
      };
      
      fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), err => {
        if (err) return res.status(500).send("Error updating profile");
        res.json(users[userIndex].profile);
      });
    } else {
      res.status(404).send("User not found");
    }
  });
});

// Projects routes
app.get('/api/projects', (req, res) => {
  fs.readFile(PROJECTS_FILE, (err, data) => {
    if (err) return res.status(500).send("Error reading projects");
    res.json(JSON.parse(data));
  });
});

app.post('/api/projects', isAuthenticated, (req, res) => {
  const newProject = {
    ...req.body,
    id: Date.now().toString(),
    author: req.session.user.username,
    createdAt: new Date().toISOString()
  };

  fs.readFile(PROJECTS_FILE, (err, data) => {
    const projects = err ? [] : JSON.parse(data);
    projects.push(newProject);
    fs.writeFile(PROJECTS_FILE, JSON.stringify(projects, null, 2), err => {
      if (err) return res.status(500).send("Error saving project");
      res.status(201).json(newProject);
    });
  });
});

// Contact form messages
app.post('/api/contact', (req, res) => {
  const newMessage = {
    ...req.body,
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
    status: 'unread'
  };

  fs.readFile(MESSAGES_FILE, (err, data) => {
    const messages = err ? [] : JSON.parse(data);
    messages.push(newMessage);
    fs.writeFile(MESSAGES_FILE, JSON.stringify(messages, null, 2), err => {
      if (err) return res.status(500).send("Error saving message");
      res.status(201).json({ message: "Message sent successfully" });
    });
  });
});

// Admin routes
app.get('/api/admin/messages', isAdmin, (req, res) => {
  fs.readFile(MESSAGES_FILE, (err, data) => {
    if (err) return res.status(500).send("Error reading messages");
    res.json(JSON.parse(data));
  });
});

app.put('/api/admin/messages/:id', isAdmin, (req, res) => {
  const messageId = req.params.id;
  fs.readFile(MESSAGES_FILE, (err, data) => {
    if (err) return res.status(500).send("Server error");
    let messages = JSON.parse(data);
    const messageIndex = messages.findIndex(m => m.id === messageId);
    
    if (messageIndex !== -1) {
      messages[messageIndex] = {
        ...messages[messageIndex],
        ...req.body,
        updatedAt: new Date().toISOString()
      };
      
      fs.writeFile(MESSAGES_FILE, JSON.stringify(messages, null, 2), err => {
        if (err) return res.status(500).send("Error updating message");
        res.json(messages[messageIndex]);
      });
    } else {
      res.status(404).send("Message not found");
    }
  });
});

// Serve static files
app.use('/public', isAuthenticated, express.static(path.join(__dirname, 'public')));

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Portfolio server running at http://0.0.0.0:${PORT}`);
});
