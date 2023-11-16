import { CallError } from './errors.js';
import colors from 'colors';

const dataTypes = {
    file: 'f',
    text: 't',
    speech: 's',
    digits: 'd',
    number: 'n',
    alpha: 'a',
    zmanim: 'z',
    go_to_folder: 'g',
    system_message: 'm',
    music_on_hold: 'h',
    date: 'date',
    dateH: 'dateH'
};

/**
 * @param {String} messagesCombined
 * @param {Object} options
 * @returns {String} - the read text
 */
export function makeTapModeRead (messagesCombined, options, call) {
    const PRESETS_MIN_MAX = { // from yemot docs https://f2.freeivr.co.il/post/77520
        Date: { min_digits: 8, max_digits: 8 },
        HebrewDate: { min_digits: 8, max_digits: 8 },
        Time: { min_digits: 4, max_digits: 4 },
        TeudatZehut: { min_digits: 8, max_digits: 9 },
        Phone: { min_digits: 9, max_digits: 10 }
    };

    if (options.typing_playback_mode && PRESETS_MIN_MAX[options.typing_playback_mode]) {
        options.min_digits = PRESETS_MIN_MAX[options.typing_playback_mode].min_digits;
        options.max_digits = PRESETS_MIN_MAX[options.typing_playback_mode].max_digits;
    }

    if (options.digits_allowed && !Array.isArray(options.digits_allowed)) {
        throw new CallError({ message: `digits_allowed must be array, got ${typeof options.digits_allowed} (${options.digits_allowed})`, call });
    }

    const tapOps = [
        options.valName,
        options.re_enter_if_exists ? 'yes' : 'no',
        (options.max_digits || ''),
        (options.min_digits || 1),
        (options.sec_wait || 7),
        (options.typing_playback_mode || 'No'),
        options.block_asterisk_key ? 'yes' : 'no',
        options.block_zero_key ? 'yes' : 'no',
        options.replace_char,
        options.digits_allowed ? options.digits_allowed.join('.') : '',
        (options.amount_attempts || ''),
        (options.allow_empty ? 'Ok' : ''),
        (typeof options.empty_val === 'undefined' ? '' : String(options.empty_val)),
        (options.block_change_keyboard ? 'InsertLettersTypeChangeNo' : '')
    ];
    return `read=${messagesCombined}=${tapOps.join(',')}`;
};

/**
 * @param {String} messagesCombined
 * @param {Object} options
 * @returns {String} - the read text
 */
export function makeSttModeRead (messagesCombined, options, call) {
    if (options.use_records_recognition_engine) {
        if (typeof options.block_typing !== 'undefined') {
            throw new CallError({ message: 'block_typing setting option is not available when use_records_recognition_engine is true - typing is always blocked in records recognition engine', call });
        }
    } else {
        if (options.quiet_max) {
            throw new CallError({ message: 'quiet_max option is only available when use_records_recognition_engine is true', call });
        } else if (options.length_max) {
            throw new CallError({ message: 'length_max option are only available when use_records_recognition_engine is true', call });
        }
    }

    const sttOps = [
        options.valName,
        options.re_enter_if_exists ? 'yes' : 'no',
        'voice',
        options.lang,
        (options.block_typing ? 'no' : ''),
        (options.max_digits || ''),
        (options.quiet_max || ''),
        (options.max_length || ''),
        (options.use_records_recognition_engine ? 'record' : '')
    ];
    return `read=${messagesCombined}=${sttOps.join(',')}`;
};

/**
 * @param {String} messagesCombined
 * @param {Object} options (record options)
 * @returns {String} - the read text
 */
export function makeRecordModeRead (messagesCombined, options, call) {
    const recordOps = [
        options.valName,
        options.re_enter_if_exists ? 'yes' : 'no',
        'record',
        options.path,
        options.file_name,
        (options.no_confirm_menu ? 'no' : ''),
        (options.save_on_hangup ? 'yes' : ''),
        (options.append_to_existing_file ? 'yes' : ''),
        (options.min_length || ''),
        (options.max_length || '')
    ];
    return `read=${messagesCombined}=${recordOps.join(',')}`;
};

function validateCharsForTTS (text, call) {
    const invalidCharsRgx = /[.\-"'&|]/g;
    const invalidCharsMatched = text.match(invalidCharsRgx);
    if (invalidCharsMatched) {
        throw new CallError({ message: `message '${text}' has invalid characters for yemot: ${colors.red(invalidCharsMatched.join(', '))}`, call });
    }
}

function removeInvalidChars (text) {
    const invalidCharsRgx = /[.\-"'&|]/g;
    const invalidCharsMatched = text.match(invalidCharsRgx);
    if (invalidCharsMatched) {
        console.log(`invalid characters for yemot have been removed from the text: ${colors.red(invalidCharsMatched.join(''))} [original text: ${text}]`);
    }
    return text.replaceAll(invalidCharsRgx, '');
}

export function makeMessagesData (messages, options, call) {
    for (const msg of messages) {
        if (typeof msg.data !== 'string') continue;
        if (msg.type === 'text' && (msg.removeInvalidChars ?? options.removeInvalidChars)) {
            msg.data = removeInvalidChars(msg.data);
        } else {
            validateCharsForTTS(msg.data, call);
        }
    }

    let res = '';
    let i = 1;
    for (const value of messages) {
        if (i > 1) res += '.';

        if (typeof value.type !== 'string') {
            throw new CallError({ message: `type must be a string, got ${typeof value.type}`, call });
        }
        if (!dataTypes[value.type]) {
            throw new CallError({ message: `${value.type} is not a valid type!\nValid types are: ${Object.keys(dataTypes).join(', ')}`, call });
        }

        res += dataTypes[value.type] + '-';

        switch (value.type) {
        case 'zmanim': {
            if (typeof value.data !== 'object') throw new CallError({ message: 'in "zmanim" type, data should be an object', call });
            let differenceSplitted;
            if (value.data.difference) {
                if (!/(-|\+)[YMDHmSs]\d+/.test(value.data.difference)) throw new CallError({ message: 'difference is invalid', call });
                differenceSplitted = value.data.difference.match(/(-|\+)(.+)/);
            }
            res += [
                value.data.time || 'T',
                value.data.zone || 'IL/Jerusalem',
                differenceSplitted ? differenceSplitted[1] : '',
                differenceSplitted ? differenceSplitted[2] : ''
            ].join(',');
            i++;
            break;
        }
        case 'music_on_hold': {
            if (typeof value.data !== 'object') throw new CallError({ message: 'in "music_on_hold" type, data should be an object', call });
            if (typeof value.data.musicName !== 'string') throw new CallError({ message: 'in "music_on_hold" type, data.musicName should be a string', call });
            if (typeof value.data.maxSec !== 'undefined' && !Number.isInteger(parseInt(value.data.maxSec))) throw new CallError({ message: 'in "music_on_hold" type, data.seconds should be a integer', call });
            if (value.data.maxSec) {
                res += `${value.data.musicName},${value.data.maxSec}`;
            } else {
                res += value.data.musicName;
            }
            i++;
            break;
        }
        case 'system_message': {
            const sysMsgId = String(value.data).replace('M', '').trim();
            if (!Number.isInteger(parseInt(sysMsgId))) {
                throw new CallError({ message: `'${value.data}' is not a valid system message id`, call });
            }
            if (sysMsgId.length !== 4) {
                throw new CallError({ message: `'${value.data}' is not a valid system message id - it should be 4 digits, got ${sysMsgId.length}!`, call });
            }
            res += sysMsgId;
            i++;
            break;
        }
        case 'date':
        case 'dateH':
            if (!/^\d{2}\/\d{2}\/\d{4}$/.test(value.data)) {
                throw new CallError({ message: `'${value.data}' is not a valid date format. should be DD/MM/YYYY format`, call });
            }
            res += value.data;
            i++;
            break;
        default:
            res += value.data;
            i++;
        }
        if (value.type === 'go_to_folder') break;
    }
    return res;
};