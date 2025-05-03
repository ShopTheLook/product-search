import express from 'express';
import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';

    dotenv.config();

    const app = express();
    const PORT = 3000;

    const AUTH_HEADER = process.env.AUTH_HEADER;

    if (!AUTH_HEADER) {
        throw new Error('Authorization header is not set in the environment variables.');
    }

    app.use(express.json());

    app.post('/search', async (req, res) => {
        const body = req.body || {};
        if (!body.top || !body.bottom) {
            return res.status(400).json({ error: 'Missing "top" or "bottom" in request body.' });
        }
        const queries = [body.top, body.bottom];

        try {
            const results = await Promise.all(queries.map(async (query) => {
                try {
                    const browser = await puppeteer.launch({ headless: true });
                    const page = await browser.newPage();

                    // Set a credible user agent
                    await page.setUserAgent(
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36'
                    );

                    // Set additional headers
                    await page.setExtraHTTPHeaders({
                        Authorization: AUTH_HEADER,
                        'Content-Type': 'application/json',
                    });

                    // Perform the search request
                    const searchUrl = `https://api.inditex.com/searchpmpa/products?query=${query}&page=1&perPage=1&brand=zara`;
                    await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });

                    const responseBody = await page.evaluate(() => JSON.parse(document.body.innerText));
                    const product = responseBody[0];
                    const productLink = product?.link;
                    if (!productLink) throw new Error('No link found');

                    const productPrice = product?.offers?.price ?? product?.price ?? null;
                    const productPageLink = product?.offers?.url ?? product.link ?? null;

                    // Navigate to the product page
                    await page.goto(productLink, { waitUntil: 'domcontentloaded' });

                    // Scrape the penultimate image using Cheerio
                    const pageContent = await page.content();
                    const $ = cheerio.load(pageContent);
                    const imageLis = $('ul.product-detail-view__extra-images li');
                    // logging the image list for debugging
                    const lastThreeImages = imageLis.slice(-3).map((_, el) => {
                        const srcset = $(el).find('source').attr('srcset');
                        return srcset?.split(' ')[0] || null;
                    }).get();

                    await browser.close();

                    return {
                        name: product.name,
                        images: lastThreeImages,
                        price: productPrice?.value?.current ?? productPrice ?? null,
                        link: productPageLink,
                    };
                } catch (err) {
                    return {
                        name: null,
                        image: null,
                        error: err.message,
                    };
                }
            }));

            res.status(200).json({
                top: results[0],
                bottom: results[1],
            });
        } catch (err) {
            res.status(500).json({ error: 'Internal Server Error', details: err.message });
        }
    });

    app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });