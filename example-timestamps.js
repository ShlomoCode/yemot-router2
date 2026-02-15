import express from 'express';
import { YemotRouter } from './index.js';

const app = express();
app.use(express.urlencoded({ extended: true }));

// דוגמה עם timestamps מופעלים
const router = YemotRouter({
    printLog: true,
    logTimestamps: true // 👈 הפעלת timestamps
});

router.get('/', async (call) => {
    const response = await call.read([{
        type: 'text',
        data: 'שלום, הקש 1 להמשך'
    }], 'tap', {
        max_digits: 1,
        digits_allowed: [1]
    });

    return call.id_list_message([{
        type: 'text',
        data: 'תודה, להתראות'
    }]);
});

app.use(router);

const PORT = 9770;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Example with timestamps enabled`);
});
