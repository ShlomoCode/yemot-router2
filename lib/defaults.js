export default {
    printLog: false,
    logTimestamps: false,
    removeInvalidChars: false,
    read: {
        // val_name is dynamic generated
        timeout: 0,
        re_enter_if_exists: false,
        removeInvalidChars: false,
        tap: {
            min_digits: 1,
            max_digits: '',
            sec_wait: 7,
            typing_playback_mode: 'No',
            block_asterisk_key: false,
            block_zero_key: false,
            replace_char: '',
            digits_allowed: '',
            amount_attempts: '',
            allow_empty: false,
            empty_val: 'None',
            block_change_keyboard: false
        },
        stt: {
            lang: '',
            block_typing: false,
            max_digits: '',
            quiet_max: '',
            max_length: '',
            use_records_recognition_engine: false
        },
        record: {
            path: '',
            file_name: '',
            no_confirm_menu: false,
            save_on_hangup: false,
            append_to_existing_file: false,
            min_length: '',
            max_length: ''
        }
    },
    id_list_message: {
        removeInvalidChars: false
        // prependToNextAction not supported as default
    }
};