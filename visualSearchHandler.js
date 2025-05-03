import puppeteer from "puppeteer";

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

        const searchUrl = `https://api.inditex.com/pubvsearch/products?image=${body.url}`;

        console.log('Navigating to search URL:', searchUrl);
        const response = await page.goto(searchUrl, {waitUntil: 'domcontentloaded'});

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

        if (!product || !product.link) {
            await browser.close();
            return res.status(500).json({ error: 'Product or link not found in response.' });
        }

        // Navigate to the product page
        console.log('Navigating to product page:', product.link);
        await page.goto(product.link, { waitUntil: 'domcontentloaded' });

        // Scrape last three image URLs based on the correct HTML structure
        const lastThreeImages = await page.evaluate(() => {
            const wrappers = Array.from(document.querySelectorAll('ul.product-detail-view__extra-images li'));
            const urls = wrappers.map(wrapper => {
                const source = wrapper.querySelector('picture source');
                const srcset = source?.getAttribute('srcset') || '';
                const entries = srcset.split(',');
                // Prefer 1118px width if available, otherwise take highest
                const preferred = entries.find(e => e.includes('w=1118')) || entries[entries.length - 1];
                return preferred.trim().split(' ')[0];
            }).filter(Boolean);
            return urls.slice(-3);
        });

        await browser.close();

        res.status(200).json({
            name: product.name,
            price: product.price?.value?.current,
            currency: product.price?.currency,
            link: product.link,
            images: lastThreeImages,
        });
    } catch (err) {
        console.error('Caught error before throwing:', err.message);
        return {
            name: null,
            image: null,
            error: err.message,
        };
    }
};