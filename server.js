const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = 3000;
const GUESTS_FILE = path.join(__dirname, 'guests.json');
const CONFIG_FILE = path.join(__dirname, 'config.json');

// Helper to read JSON
const readJSON = async (file) => {
    try {
        const data = await fs.promises.readFile(file, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        if (err.code === 'ENOENT') return [];
        throw err;
    }
};

// Helper to write JSON
const writeJSON = async (file, data) => {
    await fs.promises.writeFile(file, JSON.stringify(data, null, 2));
};

const server = http.createServer(async (req, res) => {
    console.log(`${req.method} ${req.url}`);

    // CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const setJSONResponse = (statusCode, payload) => {
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload));
    };

    try {
        // --- SERVE STATIC FILES ---
        if (req.method === 'GET' && !req.url.startsWith('/api')) {
            let filePath = req.url === '/' ? 'public/index.html' : path.join('public', req.url);
            if (req.url === '/dashboard') filePath = 'public/dashboard.html';

            const ext = path.extname(filePath);
            let contentType = 'text/html';
            const mimeTypes = {
                '.js': 'text/javascript',
                '.css': 'text/css',
                '.json': 'application/json',
                '.png': 'image/png',
                '.jpg': 'image/jpg',
                '.ico': 'image/x-icon',
                '.mp4': 'video/mp4',
            };
            contentType = mimeTypes[ext] || 'text/html';

            try {
                const content = await fs.promises.readFile(filePath);
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(content);
            } catch (err) {
                if (err.code === 'ENOENT') {
                    // Fallback for clean URLs like /dashboard -> /dashboard.html
                    try {
                        const htmlContent = await fs.promises.readFile(filePath + '.html');
                        res.writeHead(200, { 'Content-Type': 'text/html' });
                        res.end(htmlContent);
                    } catch (subErr) {
                        res.writeHead(404);
                        res.end('<h1>404 Not Found</h1>');
                    }
                } else {
                    res.writeHead(500);
                    res.end('Server Error');
                }
            }
            return;
        }

        // --- API ROUTES ---

        // Config Endpoints
        if (req.url === '/api/config') {
            if (req.method === 'GET') {
                const config = await readJSON(CONFIG_FILE);
                setJSONResponse(200, config);
            } else if (req.method === 'POST') {
                let body = '';
                req.on('data', chunk => body += chunk);
                req.on('end', async () => {
                    try {
                        const newConfig = JSON.parse(body);
                        await writeJSON(CONFIG_FILE, newConfig);
                        setJSONResponse(200, { success: true });
                    } catch (e) {
                        setJSONResponse(400, { error: 'Invalid JSON' });
                    }
                });
            }
            return;
        }

        // Guests Endpoints
        if (req.url.startsWith('/api/guests')) {
            if (req.method === 'GET') {
                const guests = await readJSON(GUESTS_FILE);
                setJSONResponse(200, guests);
            } else if (req.method === 'DELETE') {
                // Format: /api/guests/:id
                const parts = req.url.split('/');
                const id = parts[parts.length - 1]; // Assume ID is last segment

                let guests = await readJSON(GUESTS_FILE);
                const initialLength = guests.length;
                guests = guests.filter(g => g.id !== id);

                if (guests.length !== initialLength) {
                    await writeJSON(GUESTS_FILE, guests);
                    setJSONResponse(200, { success: true });
                } else {
                    setJSONResponse(404, { error: 'Guest not found' });
                }
            } else if (req.method === 'PUT') {
                // Update guest
                let body = '';
                req.on('data', chunk => body += chunk);
                req.on('end', async () => {
                    try {
                        const updateData = JSON.parse(body);
                        let guests = await readJSON(GUESTS_FILE);
                        const index = guests.findIndex(g => g.id === updateData.id);

                        if (index !== -1) {
                            guests[index] = { ...guests[index], ...updateData };
                            await writeJSON(GUESTS_FILE, guests);
                            setJSONResponse(200, { success: true });
                        } else {
                            setJSONResponse(404, { error: 'Guest not found' });
                        }
                    } catch (e) {
                        setJSONResponse(400, { error: 'Invalid JSON' });
                    }
                });
            }
            return;
        }

        // RSVP Endpoint
        if (req.url === '/api/rsvp' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const newGuest = JSON.parse(body);
                    // Add ID if not present
                    if (!newGuest.id) newGuest.id = crypto.randomUUID();
                    newGuest.timestamp = new Date().toISOString();

                    const guests = await readJSON(GUESTS_FILE);
                    guests.push(newGuest);
                    await writeJSON(GUESTS_FILE, guests);
                    setJSONResponse(200, { success: true });
                } catch (e) {
                    setJSONResponse(400, { error: 'Invalid JSON' });
                }
            });
            return;
        }

        res.writeHead(404);
        res.end('Endpoint Not Found');

    } catch (serverError) {
        console.error(serverError);
        res.writeHead(500);
        res.end('Internal Server Error');
    }
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
