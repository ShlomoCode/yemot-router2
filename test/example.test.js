import request from 'supertest';
import { CallSimulator } from './utils';
import { app as exampleApp, router } from '../example-app/index.js';
import qs from 'qs';

describe('example-app file', () => {
    const randomPort = Math.floor(Math.random() * 10000) + 10000;
    let server;

    beforeAll(async () => {
        server = await exampleApp.listen(randomPort);
        console.log(`test server listening on port ${randomPort}`);
    });

    afterAll(async () => {
        await server.close();
    });

    const callSimulator = new CallSimulator(randomPort);

    it('should return 200 and not valid yemot request message', async () => {
        const response = await request(`http://localhost:${randomPort}`).get('/');
        expect(response.statusCode).toBe(200);
        expect(response.body.message).toBe('the request is not valid yemot request');
    });

    it('should return valid read response', async () => {
        const response = await callSimulator.get();
        expect(response.text).toBe('read=t-היי, תקיש 10=val_1,no,2,2,7,No,no,no,,10,,,None,');
    });

    it('should call added to active calls', async () => {
        expect(Object.prototype.hasOwnProperty.call(router.activeCalls, callSimulator.values.ApiCallId)).toBe(true);
    });
    it('should all query params added to call.values', async () => {
        const call = router.activeCalls[callSimulator.values.ApiCallId];
        for (const [key, value] of Object.entries(callSimulator.values)) {
            expect(call[key]).toBe(value);
        }
    });

    it('should return cannot POST / when use router.get', async () => {
        const response = await callSimulator.post();
        expect(response.statusCode).toBe(404);
        expect(response.error.message).toBe(`cannot POST /?${qs.stringify(callSimulator.values)} (404)`);
        expect(response.text).toMatch('Cannot POST /');
    });

    it('should continue to next read', async () => {
        callSimulator.values.val_1 = '10';
        const response = await callSimulator.get();
        expect(response.text).toBe('read=t-שלום, אנא הקש את שמך המלא=val_2,no,,1,7,HebrewKeyboard,no,no,,,,,None,');
    });

    it('should return valid hangup response and remove call from active calls', async () => {
        callSimulator.values.ApiHangup = '';
        callSimulator.values.hangup = 'yes';

        const response = await callSimulator.get();
        expect(response.body.message).toBe('hangup');
        expect(router.activeCalls[callSimulator.values.ApiCallId]).toBeUndefined();
    });
});
