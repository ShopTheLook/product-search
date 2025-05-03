import puppeteer from "puppeteer";
import * as cheerio from 'cheerio';

export const handleVisualSearch = async (req, res, AUTH_HEADER) => {
    const body = req.body || {};
    console.log('Request body:', body);

    if (!body.url) {
        console.error('Missing "url" in request body.');
        return res.status(400).json({error: 'Missing "url" in request body.'});
    }

    try {
        const browser = await puppeteer.launch({headless: true});
        const page = await browser.newPage();
        console.log('Browser launched and page created');

        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36'
        );

        await page.setExtraHTTPHeaders({
            Authorization: AUTH_HEADER,
            'Content-Type': 'application/json',
        });

        // URL-encode the image URL to ensure query is interpreted correctly
        const encodedImageUrl = encodeURIComponent(body.url);
        const searchUrl = `https://api.inditex.com/pubvsearch/products?image=${encodedImageUrl}`;

        console.log('Navigating to search URL:', searchUrl);
        const response = await page.goto(searchUrl, {waitUntil: 'domcontentloaded'});

        console.log('Search response status:', response.status());

        const responseBody = await page.evaluate(() => {
            try {
                return JSON.parse(document.body.innerText);
            } catch (err) {
                console.error('Error parsing response body:', err.message);
                return null;
            }
        });

        if (!Array.isArray(responseBody) || responseBody.length === 0) {
            console.warn('Visual search returned no results. Check URL encoding or token validity.');
        }

        console.log('Raw response body text:', await page.evaluate(() => document.body.innerText));

        const topTwo = responseBody.slice(0, 2);

        const details = await Promise.all(topTwo.map(async (product) => {
            console.log('Navigating to product page:', product.link);

            const productPage = await browser.newPage();
            await productPage.setUserAgent(
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36'
            );

            try {
                // Wait for full network idle so all lazy images load
                await productPage.goto(product.link, { waitUntil: ['domcontentloaded','networkidle2'], timeout: 30000 });
            } catch (err) {
                console.warn('Navigation aborted but proceeding:', err.message);
            }
            // Scroll to bottom to trigger lazy-load
            await productPage.evaluate(() => window.scrollBy(0, document.body.scrollHeight));
            // Pause briefly to allow lazy-loaded images to populate
            await new Promise(resolve => setTimeout(resolve, 1000));

            let images = [];
            try {
                // Wait for any <source> tags in the extra-images carousel
                await productPage.waitForSelector('ul.product-detail-view__extra-images li picture source', { timeout: 8000 });

                images = await productPage.$$eval(
                    'ul.product-detail-view__extra-images li picture source',
                    (sources) => {
                        const urls = sources
                            .map((source) => {
                                // The srcset attribute contains "URL w" entries; take the first URL
                                const srcset = source.getAttribute('srcset') || '';
                                const first = srcset.split(',')[0].trim().split(' ')[0];
                                return first;
                            })
                            .filter((url) => url && !url.includes('transparent-background'));
                        // Return the last three URLs
                        return urls.slice(-3);
                    }
                );
            } catch (err) {
                console.warn('Could not extract images:', err.message);
            }

            await productPage.close();

            return {
                name: product.name,
                price: product.price?.value?.current ?? null,
                currency: product.price?.currency ?? null,
                link: product.link,
                images,
            };
        }));

        await browser.close();

        res.status(200).json(details);
    } catch (err) {
        console.error('Caught error before throwing:', err.message);
        return {
            name: null,
            image: null,
            error: err.message,
        };
    }
};