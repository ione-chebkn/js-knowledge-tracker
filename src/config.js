// src/config.js
export const CONFIG = {
    // Репозиторий с базой знаний
    KNOWLEDGE_REPO: "https://github.com/ione-chebkn/js-knowledge-data",

    // Локальная папка для клонирования базы знаний
    LOCAL_DATA_DIR: ".js-knowledge-data",

    // Основной файл с данными (теперь generated версия)
    DATA_FILE: "knowledge-base.json",

    // Резервные файлы на случай если основной недоступен
    BACKUP_FILES: ["knowledge-base.json"],

    // GitHub настройки
    GITHUB: {
        BASE_URL: "https://api.github.com",
        USER: "ione-chebkn", // можно сделать настраиваемым
    },

    // AI настройки (для будущей фичи)
    AI: {
        PROVIDER: "deepseek", // deepseek, openai, claude
        MAX_SUGGESTIONS: 3,
        MAX_TOKENS: 1000,
    },
}
