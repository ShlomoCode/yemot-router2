import { type EventEmitter } from 'events';
import { type Router, type Request, type Send } from 'express';

interface Defaults {
    printLog?: boolean
    read?: {
        timeout?: number
        tap?: TapOptions
        stt?: SstOptions
        record?: RecordOptions
    }
    id_list_message?: IdListMessageOptions
}

// from @types/express - https://github.com/DefinitelyTyped/DefinitelyTyped/blob/f800de4ffd291820a9e444e6b6cd3ac9b4a16e53/types/express/index.d.ts#L73-#L92
interface ExpressRouterOptions {
    /**
     * Enable case sensitivity.
     */
    caseSensitive?: boolean | undefined

    /**
     * Preserve the req.params values from the parent router.
     * If the parent and the child have conflicting param names, the child’s value take precedence.
     *
     * @default false
     * @since 4.5.0
     */
    mergeParams?: boolean | undefined

    /**
     * Enable strict routing.
     */
    strict?: boolean | undefined
}

type YemotRouterOptions = ExpressRouterOptions & {
    timeout?: number
    printLog?: boolean
    uncaughtErrorHandler?: (error: Error, call: Call) => void | Promise<unknown>
    defaults?: Defaults
};

type CallHandler = (call: Call) => Promise<unknown>;

interface RouterEventEmitter extends EventEmitter {
    on: (eventName: 'call_hangup' | 'call_continue' | 'new_call', listener: (call: Call) => void) => this
    once: (eventName: 'call_hangup' | 'call_continue' | 'new_call', listener: (call: Call) => void) => this
}

export function YemotRouter (options?: YemotRouterOptions): {
    get: (path: string, handler: CallHandler) => void
    post: (path: string, handler: CallHandler) => void
    all: (path: string, handler: CallHandler) => void
    use: Router['use']
    /**
     * delete call from active calls by callId
     * @returns true if the call was deleted, false if the call was not found
     */
    deleteCall: (callId: string) => boolean
    events: RouterEventEmitter
    defaults: Defaults
    /**
     * מתודה לשימוש בטייפסקריפט בלבד
     * ---------------
     * מחזיר את הראוטר ‫(`YemotRouter`) כפי שהוא - עם טייפ של ‫`Express.Router`, למניעת שגיאת טייפ
     * @example ```ts
     * import express from 'express';
     * import { YemotRouter } from 'yemot-router';
     *  
     * const app = express();
     * const router = YemotRouter();
     * 
     * app.use(router.asExpressRouter()); // 👈👈👈
     * ```
     */
    asExpressRouter: () => Router
};

// based of https://tchumim.com/post/157692, https://tchumim.com/post/157706
interface ReadModes {
    tap: TapOptions
    stt: SstOptions
    record: RecordOptions
}

/**
 * מייצג "שיחה", עליה ניתן להפעיל מתודות שונות כמו ‫`read`, `id_list_message`, `go_to_folder` וכו'
 */
export interface Call {
    /**
     * מתודה לקבלת נתון מהמחייג, מחזירה ‫`Promise` שנפתר עם סטרינג עם התשובה (במקרה של בקשת הקלטה, יחזור נתיב הקובץ)<br>
     * [פירוט נוסף על ‫read בתיעוד ימות המשיח](https://f2.freeivr.co.il/post/78283)
     * @param messages מערך ההודעות שיושמעו למשתמש לפני קבלת הנתון
     * @param mode סוג הנתון שמבקשים מהמחייג<br>
     * `tap` = הקשות<br>
     * `stt` = זיהוי דיבור<br>
     * `record` = הקלטה
     * @param options אפשרויות נוספות לפי סוג הנתון - לדוגמה ספרות מותרות להקשה, מקסימום ספרות, וכולי
     */
    read: <T extends keyof ReadModes>(messages: Msg[], mode: T, options?: ReadModes[T]) => Promise<string>
    /**
     * מתודה להעברת השיחה לשלוחה מסוימת במערכת הנוכחית
     * @param target נתיב למעבר, יחסי לשלוחה הנוכחית, יחסי לשלוחה הראשית (מתחיל ב`/`). [פירוט של האופציות הזמינות](https://f2.freeivr.co.il/post/58)
     * @see {@link hangup|`call.hangup()`} - קיצור לנוחות של ‫`go_to_folder('hangup')`
     */
    go_to_folder: (target: string) => void
    /**
     * במתודה זו ניתן להשמיע למשתמש הודעה אחת או יותר<br>
     * <hr>
     * 
     * ⚠️ שים לב! ⚠️<br>
     * לאחר השמעת ההודעות, השיחה תצא אוטומטית מהשלוחה!
     * באם מעוניינים לשרשר פעולה נוספת לאחר ההשמעה, לדוגמה להשמיע הודעה ואז לבצע ‫`read` (קבלת נתונים נוספים), יש להגדיר בארגומנט ה‫`options` את ‫`prependToNextAction` ל‫`true`
     * @param messages 
     * @param options 
     * @example  השמעת הודעה ויציאה מהשלוחה
     * ```js
     * call.id_list_message([{ type: 'text', data: 'הודעה לדוגמה' }]);
     * ```
     * @example השמעת הודעה והמשך לפעולה הבאה - לדוגמה ‫`read`
     * ```js
     * call.id_list_message([{ type: 'text', data: 'הודעה לדוגמה' }], { prependToNextAction: true });
     * const res = await call.read([{ type: 'text', data: 'הקש משהו' }], 'tap');
     * ```
     */
    id_list_message: (messages: Msg[], options?: IdListMessageOptions) => void
    /**
     * מתודה להעברת השיחה למערכת אחרת בימות המשיח ללא עלות יחידות, באמצעות ‫"ראוטינג ימות"<br>
     * הפונקציה מקבלת ארגומנט יחיד - סטרינג של מספר מערכת בימות להעברת השיחה אליה<br>
     */
    routing_yemot: (number: string) => void
    /**
     * הפעלה מחדש של השלוחה הנוכחית<br>
     * <hr>
     * 
     * ‫קיצור לתחביר הבא:
     * ```js
     * call.go_to_folder(`/${call.ApiExtension}`);
     * ```
     */
    restart_ext: () => void
    hangup: () => void
    /**
     * ניתן להשתמש במתודה זו כדי לשלוח סטרינג חופשי לחלוטין, לדוגמה עבור פונקציונליות שעדיין לא נתמכת בספרייה<br>
     * במתודה זו יש להעביר את הסטרינג בדיוק כפי שמעוניינים שהשרת של ימות יקבל אותו, והוא לא עובר אף ולידציה או עיבוד<br>
     * 
     * :כדי להשתמש לבקשת מידע - לדוגמה מעבר לסליקת אשראי, ניתן לשלב עם קריאות ל
     * ```
     * await call.blockRunningUntilNextRequest();
     * ```
     */
    send: Send
    values: Readonly<Record<string, string>>
    defaults: Defaults
    req: Request
    /**
     * מספר הטלפון **הראשי** של המערכת<br>
     * קיצור של ‫{@link ApiDID|`call.ApiDID`}
     */
    did: string
    /**
     * מספר הטלפון של המחייג<br>
     * קיצור של ‫{@link ApiPhone|`call.ApiPhone`}
     */
    phone: string
    /**
     * המספר אליו חייג המשתמש<br>
     * במידה ויש כמה מספרים למערכת שלכם, והלקוח צלצל למספר משנה, הערך הזה יהיה שונה מהערך הקודם<br>
     * קיצור של ‫{@link ApiRealDID|`call.ApiRealDID`}
     */
    real_did: string
    /**
     * מזהה ייחודי לאורך השיחה<br>
     * קיצור של ‫{@link ApiCallId|`call.ApiCallId`}
     */
    callId: string
    /**
     * שם התיקייה/שלוחה בה נמצא המשתמש<br>
     * קיצור של ‫{@link ApiExtension|`call.ApiExtension`}
     * @example "9" - שלוחה 9 בתפריט הראשי
     * @example "" - שלוחה ראשית
     */
    extension: string
    /**
     * מזהה ייחודי לאורך השיחה
     * <hr>
     * @see {@link callId|`call.callId`} (קיצור לנוחות)
     */
    ApiCallId: string
    /**
     * מספר הטלפון של המחייג
     * <hr>
     * @see {@link phone|`call.phone`} (קיצור לנוחות)
     */
    ApiPhone: string
    /**
     * מספר הטלפון **הראשי** של המערכת
     * <hr>
     * @see {@link did|`call.did`} (קיצור לנוחות)
     */
    ApiDID: string
    /**
     * המספר אליו חייג המשתמש<br>
     * במידה ויש כמה מספרים למערכת והלקוח חייג למספר משנה, הערך הזה יהיה שונה מ ‫{@link ApiDID|`call.ApiDID`}
     * <hr>
     * @see {@link real_did|`call.real_did`} (קיצור לנוחות)
     */
    ApiRealDID: string
    /**
     * שם התיקייה/שלוחה בה נמצא המשתמש
     * <hr>
     * @see {@link extension|`call.extension`} (קיצור לנוחות)
     * @example "9" - שלוחה 9 בתפריט הראשי
     * @example "" - שלוחה ראשית
    */
    ApiExtension: string
    /**
     * במידה ובוצעה התחברות לפי זיהוי אישי, יצורף ערך זה המכיל את סוג ההתחברות וה-ID של המשתמש (מידע נוסף [כאן](https://f2.freeivr.co.il/post/1250))
     */
    ApiEnterID: string
    /**
     * שם משויך לזיהוי האישי (כפי שמוסבר בערך של `login_add_val_name=yes` [כאן](https://f2.freeivr.co.il/post/2015))
     */
    ApiEnterIDName: string
    /**
     * זמן בשניות מ1970, Epoch, i.e., since 1970-01-01 00:00:00 UTC
     * @example "1683594518"
     */
    ApiTime: string
    /**
     * זהה ל`callId` של הcalls בAPI `GetCallsStatus`
     */
    ApiYFCallId: string
}

/**
 * מייצג "הודעה" הניתנת להשמעה ב‫`read`/`id_list_message`
 */
export interface Msg {
    type: 'file' | 'text' | 'speech' | 'digits' | 'number' | 'alpha' | 'zmanim' | 'go_to_folder' | 'system_message' | 'music_on_hold' | 'date' | 'dateH'
    data: string | number | { time?: string, zone?: string, difference?: string }
     /**
     * האם להסיר אוטומטית תווים לא חוקיים (`.`,`-`,`'`,`"`,`&`) מתשובות הקראת טקסט<br>
     * ,באם לא מוגדרת הסרה (ברירת מחדל), תיזרק שגיאה<br>
     * באם מוגדרת הסרה ‫(`true`) התווים יוסרו מהתשובה שתוחזר לימות ולא תיזרק שגיאה<br>
     * ניתן להגדיר ערך זה ב3 רמות, ראו [תיעוד מלא](https://github.com/ShlomoCode/yemot-router2#%D7%AA%D7%95%D7%95%D7%99%D7%9D-%D7%9C%D7%90-%D7%97%D7%95%D7%A7%D7%99%D7%99%D7%9D-%D7%91%D7%94%D7%A7%D7%A8%D7%90%D7%AA-%D7%98%D7%A7%D7%A1%D7%98)
     * @default false
     */
    removeInvalidChars?: boolean
}

interface GeneralReadOptions {
    /**
     * שם‫ הפרמטר בURL שבו יצורף הערך שהמשתמש הקיש<br>
     * ברירת מחדל - נקבע אוטומטית: ‫`val_1`, `val_2`, `val_3` וכו' בסדר עולה
     */
    val_name?: string
    /**
     * האם לבקש את הערך שוב אם הפרמטר בשם שנבחר ‫({@link GeneralReadOptions.val_name|`val_name`}) כבר קיים ‫בURL<br>
     * ברירת מחדל - המערכת תבקש מחדש, במידה ומוגדר ‫`true` בערך זה, המערכת תשתמש בערך הקודם שהוקש ותשלח אותו בתור תשובה
     */
    re_enter_if_exists?: boolean
    /**
     * האם להסיר אוטומטית תווים לא חוקיים (`.`,`-`,`'`,`"`,`&`) מתשובות הקראת טקסט<br>
     * ,באם לא מוגדרת הסרה (ברירת מחדל), תיזרק שגיאה<br>
     * באם מוגדרת הסרה ‫(`true`) התווים יוסרו מהתשובה שתוחזר לימות ולא תיזרק שגיאה<br>
     * ניתן להגדיר ערך זה ב3 רמות, ראו [תיעוד מלא](https://github.com/ShlomoCode/yemot-router2#%D7%AA%D7%95%D7%95%D7%99%D7%9D-%D7%9C%D7%90-%D7%97%D7%95%D7%A7%D7%99%D7%99%D7%9D-%D7%91%D7%94%D7%A7%D7%A8%D7%90%D7%AA-%D7%98%D7%A7%D7%A1%D7%98)
     * @default false
     */
    removeInvalidChars?: boolean
}

export interface TapOptions extends GeneralReadOptions {
    /**
     * כמות ההקשות המקסימלית<br>
     * ברירת מחדל ללא הגבלה
     */
    max_digits?: number
    /**
     * כמות ההקשות המינימלית<br>
     * ברירת מחדל: 1
     * @default 1
     */
    min_digits?: number
    /**
     * זמן המתנה להקשה בשניות<br>
     * ברירת מחדל: 7 שניות
     * @default 7
     */
    sec_wait?: number
    /**
     * צורת ההשמעה למשתמש את הקשותיו<br>
     * באם מעוניינים במקלדת שונה ממקלדת ספרות, כגון ‫`EmailKeyboard` או ‫`HebrewKeyboard`, יש להכניס כאן את סוג המקלדת [ראו example.js]<br>
     * פירוט על כל אופציה ניתן למצוא בתיעוד מודול API של ימות המשיח, תחת"הערך השישי (הקשה)".
     * @default "No"
     */
    typing_playback_mode?: 'number' | 'Digits' | 'File' | 'TTS' | 'Alpha' | 'No' | 'HebrewKeyboard' | 'EmailKeyboard' | 'EnglishKeyboard' | 'DigitsKeyboard' | 'TeudatZehut' | 'Price' | 'Time' | 'Phone' | 'No'
    /**
     * האם לחסום מקש כוכבית
     * @default false
     */
    block_asterisk_key?: boolean
    /**
     * האם לחסום מקש אפס
     * @default false
     */
    block_zero_key?: boolean
    /**
     * החלפת תווים
     * החלפת מקש בכל סימן אחר<br>
     * לדוגמה במידה ואתם רוצים שישלח כתובת ספריה כאשר המפריד בין התיקיות הוא סלש ‫(/)<br>
     * בטלפון לא ניתן להקיש סלש, אבל ניתן לבקש מהלקוח להקיש כוכבית בין תיקייה לתיקייה, ולסמן להחליף את הכוכבית בסלש<br>
     * ערך זה יכול להכיל 2 סימנים: הסימן הראשון את איזה ערך להחליף, הסימן השני זה מה לשים במקום מה שהוחלף<br>
     * @example "*@""
     * כלומר להחליף את מקש כוכבית בסלש
     */
    replace_char?: string
    /**
     *  איזה מקשים המשתמש יוכל להקיש<br>
     * באם המשתמש יקיש מקש שלא הוגדר המערכת תודיע ‫‫`M1224` "בחירה לא חוקית"<br>
     * 
     * ברירת מחדל: המשתמש יכול להקיש על כל המקשים<br>
     * @example [1, 2, '3', '*']
     * @example [10, 20, 30, 40]
     */
    digits_allowed?: Array<number | string>
    /** 
     * ברירת מחדל במידה והמשתמש לא הקיש כלום ועבר הזמן שהוגדר להקשה ‫({@link TapOptions.sec_wait}) הנתון שהמערכת קולטת הוא ריק<br>
     * כמות הפעמים שהמערכת משמיעה את השאלה לפני שהיא מגדירה את הנתון כ"ריק" היא פעם אחת
     * בערך זה ניתן להגדיר כמות פעמים שונה
     * @see {@link TapOptions.allow_empty}
     * @default 1
     */
    amount_attempts?: number
    /**
     * ברירת מחדל, במידה והנתון שהתקבל הוא "ריק" (ראה {@link TapOptions.amount_attempts}) המערכת משמיעה `M1002` "לא הוקשה בחירה" והמשתמש עובר להקשה מחודשת של הנתון
     * ניתן להגדיר שאם הנתון ריק המערכת תתקדם הלאה
     * @default false
     * @see {@link TapOptions.empty_val}
     */
    allow_empty?: boolean
    /**
     * הערך שיישלח כשלא הוקשה תשובה. ברירת מחדל: ‫`"None"`<br>
     * ניתן להעביר גם ערכים שאינם מחרוזת, לדוגמה ‫`null` והערך שיתקבל מה‫read יהיה ‫`null` ולא ‫`"null"`
     * <hr>
     * 
     * :למשתמשי טייפסקריפט בלבד
     * ---------------
     * כאשר מגדירים ‫`empty_val` שאינו מסוג ‫`string`, כרגע ‫ה‫DTS לא מוגדר להסיק את הטייפ אוטומטית, ויש להגדיר אותו ידנית עם ‫`as`, דוגמה:
     * ```ts
     * const res = await call.read([{ type: 'text', data: 'please type one' }], 'tap', {
     *     allow_empty: true,
     *     empty_val: null,
     * }) as string | null;
     * ```
     * <hr>
     * @default "None"
     */
    empty_val?: any
    /**
     * האם לחסום שינוי מצב הקלדה<br>
     * באם הוגדר ב‫{@link typing_playback_mode} מצב מקלדת,
     * ברירת מחדל המשתמש יכול בתפריט סיום או ביטול (במקש כוכבית) לשנות את סוג המקלדת.<br>
     * באם הגדרה זו מופעלת, אם המשתמש מנסה לשנות שפה האופציה תיחסם, והמערכת תשמיע ‫`M4186` "שינוי שפת הקלדה חסום בכתיבה זו"
     * @default false
     */
    block_change_keyboard?: boolean
}

export interface SstOptions extends GeneralReadOptions {
    /**
     * שפה לזיהוי הדיבור<br>
     * ברירת מחדל: עברית (או מה שהוגדר בערך ‫`lang` בשלוחה)<br>
     * [רשימת השפות הנתמכות](https://drive.google.com/file/d/1UC_KOjhZgPWZff8BcUfBLwMbSmKewy8A/view)
     */
    lang?: string
    /**
     * שלא יהיה ניתן להקיש במקום לדבר<br>
     * (ברירת המחדל היא שהמשתמש יכול או לדבר או להקיש)
     * @default false
     */
    block_typing?: boolean
    /**
     * כמות הספרות המקסימלית שהמשתמש יוכל להקיש<br>
     * ברירת מחדל: אין הגבלה
     */
    max_digits?: number
    /**
     * האם להשתמש במנוע זיהוי דיבור של הקלטות (תומך בזיהוי ארוך, אך לא מאפשר או הקשה או דיבור)<br>
     * @default false
     */
    use_records_recognition_engine?: boolean
    /**
     * אחרי כמה שניות של שקט לסיים את ההקלטה (ברירת מחדל - לא מפסיק)<br>
     * רלוונטי רק אם משתמשים במנוע זיהוי טקסטים ארוכים ‫({@link use_records_recognition_engine})
    */
   quiet_max?: number
    /**
    * מספר שניות מרבי להקלטה (ברירת מחדל: ללא הגבלה)
    */
    length_max?: number
}

export interface RecordOptions extends GeneralReadOptions {
    /**
     * (היכן תישמר ההקלטה במערכת (נתיב לתקיה, שם הקובץ מוגדר בנפרד<br>
     * 
     * ברירת מחדל - נשמרת בתיקייה שמוגדרת ב ‫`api_dir` בשלוחה (כלומר תקייה נוכחית בברירת מחדל)<br>
     * ניתן להגדיר מיקום שונה, לדוגמה ‫`8/` = שלוחה 8 בתפריט הראשי<br>
     * הערה: חובה לשים `/` בהתחלה, אסור לשים `/` בסוף
     */
    path?: string
    /**
     * שם הקובץ שיישמר (**ללא סיומת**)<br>
     * ברירת מחדל - מיספור אוטומטי כקובץ הגבוה בשלוחה<br>
     * לדוגמה אם הקובץ הכי גבוה בשלוחה היה 100, הקובץ החדש יהיה 101
     */
    file_name?: string
    /**
     * האם לשמור את הקובץ בסיום ישירות, ללא תפריט שמיעת ההקלטה/אישור/הקלטה מחדש/המשך הקלטה
     * @default false
     */
    no_confirm_menu?: boolean
    /**
     * @default true
     * האם לשמור את ההקלטה לקובץ אם המשתמש ניתק באמצע ההקלטה
     */
    save_on_hangup?: boolean
    /**
     * במידה והוגדר שם קובץ לשמירה (file_name) וכבר קיים קובץ בשם שנבחר<br>
     * האם לשנות את שם הקובץ הישן ולשמור את החדש בשם שנבחר (ברירת מחדל)<br>
     * או לצרף את ההקלטה החדשה לסוף הקובץ הישן
     * @default false 
     */
    append_to_existing_file?: boolean
    /**
     * (כמות שניות מינימלית להקלטה (ברירת מחדל: אין מינימום
     */
    min_length?: number
    /**
     * (כמות שניות מקסימלית להקלטה (ברירת מחדל: אין מקסימום
     */
    max_length?: number
}

interface IdListMessageOptions {
    /**
     * האם להסיר אוטומטית תווים לא חוקיים (`.`,`-`,`'`,`"`,`&`) מתשובות הקראת טקסט<br>
     * ,באם לא מוגדרת הסרה (ברירת מחדל), תיזרק שגיאה<br>
     * באם מוגדרת הסרה ‫(`true`) התווים יוסרו מהתשובה שתוחזר לימות ולא תיזרק שגיאה<br>
     * ניתן להגדיר ערך זה ב3 רמות, ראו [תיעוד מלא](https://github.com/ShlomoCode/yemot-router2#%D7%AA%D7%95%D7%95%D7%99%D7%9D-%D7%9C%D7%90-%D7%97%D7%95%D7%A7%D7%99%D7%99%D7%9D-%D7%91%D7%94%D7%A7%D7%A8%D7%90%D7%AA-%D7%98%D7%A7%D7%A1%D7%98)
     * @default false
     */
    removeInvalidChars?: boolean
    /**
     * יש להגדיר במידה ומעוניינים לשרשר פעולות נוספות (לדוגמה read)
     * @default: false
     */
    prependToNextAction?: boolean
}

export class CallError extends Error {
    readonly date: Date;
    readonly call: Call;

    constructor (options: { message: string, call: Call });
}

export class ExitError extends CallError {
    readonly context: {
        caller: 'go_to_folder' | 'id_list_message' | 'routing_yemot'
        target: string
    };

    constructor (call: Call, context: ExitError['context']);
}

export class HangupError extends CallError {
    constructor (call: Call);
}

export class TimeoutError extends CallError {
    readonly timeout: number;

    constructor (call: Call, timeout: number);
}