import { describe, expect } from '@jest/globals';
import { CallSimulator } from './utils.js';
import express from 'express';
import { YemotRouter } from '../index.js';
import request from 'supertest';

describe('test read defaults and options', () => {
    const randomPort = Math.floor(Math.random() * 10000) + 10000;
    const router = YemotRouter({ printLog: true });
    let server;

    beforeAll(async () => {
        const app = express();

        app.use(router);

        server = await app.listen(randomPort);
        console.log(`test server listening on port ${randomPort}`);
    });

    afterAll(async () => {
        await server.close();
    });

    const callSimulator = new CallSimulator(randomPort);

    it('should return 404 before view is added', async () => {
        const response = await callSimulator.get();
        expect(response.statusCode).toBe(404);
        expect(response.text).toMatch('Cannot GET /');
    });

    it('should view added', async () => {
        router.get('/', async (call) => {
            return await call.read([{
                type: 'text',
                data: 'hello world'
            }]);
        });
        const response = await request(`http://localhost:${randomPort}`).get('/');
        expect(response.statusCode).toBe(200);
    });

    it('should return not valid yemot request message', async () => {
        const response = await request(`http://localhost:${randomPort}`).get('/');
        expect(response.body.message).toBe('the request is not valid yemot request');
    });

    it('should return valid read response', async () => {
        const response = await callSimulator.get();
        expect(response.text).toBe('read=t-hello world=val_1,no,,1,7,No,no,no,,,,,None,');
    });

    it('should view added', async () => {
        router.get('/read_tap_1', async (call) => {
            return await call.read([{
                type: 'text',
                data: 'hello world'
            }], 'tap', {
                max_digits: 1,
                typing_playback_mode: 'No',
                replace_char: '',
                digits_allowed: [1, 2, 3],
                amount_attempts: 3,
                allow_empty: true,
                empty_val: 'NULL',
                block_change_keyboard: true
            });
        });
        const response = await request(`http://localhost:${randomPort}`).get('/read_tap_1');
        expect(response.statusCode).toBe(200);
    });

    it('should return valid read tap response - 1', async () => {
        const response = await new CallSimulator(randomPort).get('/read_tap_1');
        expect(response.text).toBe('read=t-hello world=val_1,no,1,1,7,No,no,no,,1.2.3,3,Ok,NULL,InsertLettersTypeChangeNo');
    });

    it('should view added', async () => {
        router.get('/read_tap_2', async (call) => {
            return await call.read([{
                type: 'text',
                data: 'hello world'
            }], 'tap', {
                block_asterisk_key: true,
                block_zero_key: true,
                typing_playback_mode: 'Digits'
            });
        });
        const response = await request(`http://localhost:${randomPort}`).get('/read_tap_2');
        expect(response.statusCode).toBe(200);
    });

    it('should return valid read tap response - 2', async () => {
        const response = await new CallSimulator(randomPort).get('/read_tap_2');
        expect(response.text).toBe('read=t-hello world=val_1,no,,1,7,Digits,yes,yes,,,,,None,');
    });

    it('should accept empty stt response (silent caller) without re-prompting', async () => {
        const callSimulator = new CallSimulator(randomPort);
        let receivedValue;
        router.get('/read_stt_silent', async (call) => {
            receivedValue = await call.read([{
                type: 'text',
                data: 'speak now'
            }], 'stt');
            return call.id_list_message([{
                type: 'text',
                data: 'got it'
            }]);
        });
        await callSimulator.get('/read_stt_silent');
        callSimulator.values.val_1 = '';
        const response = await callSimulator.get('/read_stt_silent');
        expect(receivedValue).toBe('');
        expect(response.text).toBe('id_list_message=t-got it&');
    });

    it('should response is native null (in empty_val)', async () => {
        const callSimulator = new CallSimulator(randomPort);
        router.get('/read_tap_3', async (call) => {
            const resp = await call.read([{
                type: 'text',
                data: 'hello world'
            }], 'tap', {
                allow_empty: true,
                empty_val: null
            });
            expect(resp).toBe(null);
            return call.id_list_message([{
                type: 'text',
                data: 'bye bye'
            }]);
        });
        await callSimulator.get('/read_tap_3');
        callSimulator.values.val_1 = 'null';
        await callSimulator.get('/read_tap_3')
            .then((response) => {
                expect(response.text).toBe('id_list_message=t-bye bye&');
            });
    });
});