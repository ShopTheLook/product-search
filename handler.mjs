import axios from 'axios';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';
dotenv.config();

const ZARA_SEARCH_API = 'https://api.inditex.com/searchpmpa/products';
const AUTH_HEADER = process.env.AUTH_HEADER;

if (!AUTH_HEADER) {
    throw new Error('Authorization header is not set in the environment variables.');
}
export const search = async (event) => {
    const body = event.body
        ? (typeof event.body === 'string' ? JSON.parse(event.body) : event.body)
        : {};
    if (!body.top || !body.bottom) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Missing "top" or "bottom" in request body.' })
        };
    }
    const queries = [body.top, body.bottom];

    const results = await Promise.all(queries.map(async (query) => {
        try {
            const apiRes = await axios.get(ZARA_SEARCH_API, {
                params: {
                    query,
                    page: 1,
                    perPage: 1,
                    brand: 'zara'
                },
                headers: {
                    Authorization: AUTH_HEADER,
                    'Content-Type': 'application/json'
                }
            });

            const product = apiRes.data[0];
            const productLink = product?.link;
            if (!productLink) throw new Error('No link found');

            const pageRes = await axios.get(productLink);
            const $ = cheerio.load(pageRes.data);
            const imageLis = $('ul.product-detail-view__extra-images li');
            const penultimateImage = imageLis.eq(-2).find('img').attr('src');

            return {
                name: product.name,
                image: penultimateImage
            };

        } catch (err) {
            return {
                name: null,
                image: null,
                error: err.message
            };
        }
    }));

    return {
        statusCode: 200,
        body: JSON.stringify({
            top: results[0],
            bottom: results[1]
        })
    };
};