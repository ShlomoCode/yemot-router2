import express from 'express';
import { YemotRouter } from 'yemot-router2';
import { fileURLToPath } from 'url';
import process from 'process';
export const app = express();

export const router = YemotRouter({
    printLog: true,
    uncaughtErrorHandler: (error, call) => {
        console.log(`Uncaught error in ${call.req.path} from ${call.phone}. error stack: ${error.stack}`);
        // do something with the error - like send email to developer, print details log, etc.
        return call.id_list_message([{ type: 'text', data: 'אירעה שגיאה' }]); // play nice error message to the caller
    }
});

router.events.on('call_hangup', (call) => {
    console.log(`[example.js] call ${call.callId} was hangup`);
});

router.events.on('call_continue', (call) => {
    console.log(`[example.js] call ${call.callId} was continue`);
});

router.events.on('new_call', (call) => {
    console.log(`[example.js] new call ${call.callId} from ${call.phone}`);
});

/** @param {import('yemot-router2').Call} call */
async function callHandler (call) {
    // לא ניתן להתקדם ללא הקשת 10 וסולמית
    await call.read([{ type: 'text', data: 'היי, תקיש 10' }], 'tap', {
        max_digits: 2,
        min_digits: 2,
        digits_allowed: ['10']
    });

    const name = await call.read([{ type: 'text', data: 'שלום, אנא הקש את שמך המלא' }], 'tap', { typing_playback_mode: 'HebrewKeyboard' });
    console.log('name:', name);

    const addressFilePath = await call.read(
        [
            { type: 'text', data: 'שלום ' + name },
            { type: 'text', data: 'אנא הקלט את הרחוב בו אתה גר' }
        ], 'record',
        { removeInvalidChars: true }
    );
    console.log('address file path:', addressFilePath);

    // 💰 קטע זה משתמש בזיהוי דיבור ודורש יחידות במערכת 💰
    const text = await call.read([{ type: 'text', data: 'אנא אמור בקצרה את ההודעה שברצונך להשאיר' }], 'stt');
    console.log('user message:', text);

    // לאחר השמעת ההודעה יוצא אוטומטית מהשלוחה
    // לשרשור פעולות לאחר השמעת ההודעה יש להגדיר prependToNextAction: true, ראה בREADME
    return call.id_list_message([{
        type: 'system_message',
        data: 'M1399' // תגובתך התקבלה בהצלחה
    }]);
};

router.get('/', callHandler);

// this must if you want to use post requests (api_url_post=yes)
app.use(express.urlencoded({ extended: true }));

app.use('/', router);

const port = 3000;
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
    app.listen(port, () => {
        console.log(`example yemot-router2 running on port ${port}`);
    });
}
