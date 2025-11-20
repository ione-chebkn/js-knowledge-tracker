# JS-Knowledge-Tracker
CLI инструмент для трекинга прогресса изучения JavaScript через практическое применение.

## 🎯 Что это?

Система, которая связывает теорию (статьи learn.javascript.ru) с практикой (ваши коммиты в проектах).
Превращает "изучение JavaScript" из абстрактной цели в измеримый процесс.

## 📦 Установка

```bash
npm install -g js-knowledge-tracker
```

## 🚀 Использование

### Базовые команды

```
jstrack search "события"           # Умный поиск статей и подтем
jstrack suggest "валидация формы"  # AI план для реализации фичи
jstrack list --unused              # Неиспользованные темы
jstrack view closures              # Детальный просмотр статьи
jstrack stats                      # Статистика прогресса

```

### Пример
<img width="760" height="734" alt="image" src="https://github.com/user-attachments/assets/1390800d-3a7a-4822-a794-2a453ecf2993" />
<img width="839" height="118" alt="image" src="https://github.com/user-attachments/assets/77442b0e-6a1d-4650-b184-d30276d40ce7" />
<img width="851" height="754" alt="image" src="https://github.com/user-attachments/assets/c14cb31b-901e-46bc-b07e-0e1125b19017" />

<img width="805" height="819" alt="image" src="https://github.com/user-attachments/assets/37004a0e-91a6-40b2-b9c3-f750e63adde2" />


## 🏗️ Архитектура

```
Ваш проект (js-calculator)
         ↓
   Git коммиты (c54b388)
         ↓
js-knowledge-tracker (связь)
         ↓
js-knowledge-data (статьи)
```

## 🔧 Для разработчиков

G
