import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';

export const handleSearch = async (req, res, AUTH_HEADER) => {
    const body = req.body || {};
    console.log('Request body:', body);

    if (!body.top || !body.bottom) {
        console.error('Missing "top" or "bottom" in request body.');
        return res.status(400).json({ error: 'Missing "top" or "bottom" in request body.' });
    }
    const queries = [body.top, body.bottom];
    console.log('Queries:', queries);

    try {
        console.log('Starting to process queries...');
        const results = await Promise.all(queries.map(async (query) => {
            try {
                console.log(`Launching browser for query: ${query}`);
                const browser = await puppeteer.launch({ headless: true });
                const page = await browser.newPage();
                console.log('Browser launched and page created');

                await page.setUserAgent(
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36'
                );

                await page.setExtraHTTPHeaders({
                    Authorization: AUTH_HEADER,
                    'Content-Type': 'application/json',
                });

                const searchUrl = `https://api.inditex.com/searchpmpa/products?query=${query}&page=1&perPage=1&brand=zara`;
                console.log('Navigating to search URL:', searchUrl);
                const response = await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
                console.log(`Search page response status for query "${query}":`, response.status());

                const responseBody = await page.evaluate(() => {
                    try {
                        return JSON.parse(document.body.innerText);
                    } catch (err) {
                        console.error('Error parsing response body:', err.message);
                        return null;
                    }
                });
                console.log('Raw response body text:', await page.evaluate(() => document.body.innerText));

                const product = responseBody?.[0];
                if (!product) {
                    console.error('No product found for query:', query);
                    throw new Error('No product found');
                }

                const productLink = product?.link;
                const productPrice = product?.offers?.price ?? product?.price ?? null;
                const productPageLink = product?.offers?.url ?? product.link ?? null;

                console.log('Product details:', { productLink, productPrice, productPageLink });

                if (!productLink) throw new Error('No link found');

                await page.goto(productLink, { waitUntil: 'domcontentloaded' });

                const pageContent = await page.content();
                const $ = cheerio.load(pageContent);
                const imageLis = $('ul.product-detail-view__extra-images li');
                console.log('Image list elements:', imageLis.length);

                const lastThreeImages = imageLis.slice(-3).map((_, el) => {
                    const srcset = $(el).find('source').attr('srcset');
                    return srcset?.split(' ')[0] || null;
                }).get();
                console.log('Last three images:', lastThreeImages);

                await browser.close();

                return {
                    name: product.name,
                    images: lastThreeImages,
                    price: productPrice?.value?.current ?? productPrice ?? null,
                    link: productPageLink,
                };
            } catch (err) {
                console.error('Caught error before throwing:', err.message);
                console.error('Error processing query:', query, err.message);
                return {
                    name: null,
                    image: null,
                    error: err.message,
                };
            }
        }));

        console.log('Results:', results);

        res.status(200).json({
            top: results[0],
            bottom: results[1],
        });
    } catch (err) {
        console.error('Internal Server Error:', err.message);
        console.error('Full error stack:', err.stack);
        res.status(500).json({ error: 'Internal Server Error', details: err.message });
    }
};