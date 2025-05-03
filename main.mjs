import express from 'express';
import dotenv from 'dotenv';
import { handleSearch } from './searchHandler.js';
import { handleVisualSearch } from './visualSearchHandler.js';

dotenv.config();

const app = express();
const PORT = 3000;

const AUTH_HEADER = process.env.AUTH_HEADER;

if (!AUTH_HEADER) {
    throw new Error('Authorization header is not set in the environment variables.');
}

app.use(express.json());

app.post('/search', (req, res) => handleSearch(req, res, AUTH_HEADER));
app.post('/search/visual', (req, res) => handleVisualSearch(req, res, AUTH_HEADER));

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});