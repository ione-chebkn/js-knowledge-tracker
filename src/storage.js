// src/storage.js
import fs from "fs"
import path from "path"
import { execSync } from "child_process"
import readline from "readline"
import { CONFIG } from "./config.js"
import chalk from "chalk"
const LOCAL_DATA_DIR = path.join(process.cwd(), ".js-knowledge-data")
const DATA_FILE = path.join(LOCAL_DATA_DIR, "knowledge-base.json")

export async function validateProjectExists(projectName) {
    try {
        // Используем CONFIG для GitHub URL
        const response = await fetch(`${CONFIG.GITHUB.BASE_URL}/repos/${CONFIG.GITHUB.USER}/${projectName}`)

        if (response.status === 200) {
            return { exists: true, isPublic: true }
        } else if (response.status === 404) {
            // Если нет у основного пользователя, проверим может это другой пользователь
            if (projectName.includes("/")) {
                const [user, repo] = projectName.split("/")
                const userResponse = await fetch(`${CONFIG.GITHUB.BASE_URL}/repos/${user}/${repo}`)
                if (userResponse.status === 200) {
                    return { exists: true, isPublic: true, fullName: projectName }
                }
            }
            return { exists: false }
        }
    } catch (error) {
        // Если GitHub API недоступен - пропускаем проверку
        console.log(chalk.yellow("⚠️  Не удалось проверить проект на GitHub"))
        return { exists: true, skipCheck: true }
    }

    return { exists: false }
}

export function getCurrentProjectName() {
    try {
        // Пытаемся определить из git remote
        const gitRemote = execSync("git remote get-url origin", {
            cwd: process.cwd(),
            encoding: "utf8",
        }).trim()

        // Извлекаем имя репо из URL
        const repoMatch = gitRemote.match(/\/([^\/]+)\.git$/)
        if (repoMatch) {
            return repoMatch[1]
        }

        // Или из package.json
        const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"))
        if (packageJson.name) {
            return packageJson.name
        }
    } catch (error) {
        // Если не удалось определить - используем имя папки
        return path.basename(process.cwd())
    }
}

function ensureKnowledgeRepo() {
    if (!fs.existsSync(LOCAL_DATA_DIR)) {
        console.log("📥 Клонируем базу знаний...")
        execSync(`git clone ${CONFIG.KNOWLEDGE_REPO} ${LOCAL_DATA_DIR}`, {
            stdio: "inherit",
        })
    } else {
        console.log("🔄 Обновляем базу знаний...")
        execSync("git pull", {
            cwd: LOCAL_DATA_DIR,
            stdio: "inherit",
        })
    }
}

// Добавляем функцию для поиска файла данных (на случай если основной недоступен)
function findDataFile() {
    for (const file of CONFIG.BACKUP_FILES) {
        const filePath = path.join(LOCAL_DATA_DIR, file)
        if (fs.existsSync(filePath)) {
            return filePath
        }
    }
    // Если файлов нет, создаем основной
    const mainFile = path.join(LOCAL_DATA_DIR, "knowledge-base.json")
    if (!fs.existsSync(mainFile)) {
        fs.writeFileSync(mainFile, JSON.stringify({}, null, 2))
    }
    return mainFile
}

function pushChanges(commitMessage) {
    try {
        execSync("git add knowledge-base.json", { cwd: LOCAL_DATA_DIR })

        // Проверяем есть ли изменения
        const status = execSync("git status --porcelain knowledge-base.json", {
            cwd: LOCAL_DATA_DIR,
            encoding: "utf8",
        })

        if (!status.trim()) {
            console.log(chalk.gray("   Нет изменений для коммита"))
            return true
        }

        execSync(`git commit -m "${commitMessage}"`, { cwd: LOCAL_DATA_DIR })
        execSync("git push", { cwd: LOCAL_DATA_DIR })
        console.log(chalk.green("✅ Изменения запушены в репозиторий"))
        return true
    } catch (error) {
        console.log(chalk.yellow("⚠️  Не удалось запушеть изменения:"), error.message)
        return false
    }
}
// Функция для загрузки оригинальных данных БЕЗ конвертации
function loadOriginalKnowledgeBase() {
    try {
        const dataFile = findDataFile()
        if (fs.existsSync(dataFile)) {
            return JSON.parse(fs.readFileSync(dataFile, "utf8"))
        }
    } catch (error) {
        console.error("❌ Ошибка загрузки оригинальных данных:", error.message)
    }
    return null
}

export function saveKnowledgeBase(data) {
    try {
        const targetPath = path.join(LOCAL_DATA_DIR, "knowledge-base.json")

        console.log(chalk.blue(`💾 Сохраняем изменения...`))
        console.log(chalk.gray(`   Путь: ${targetPath}`))
        console.log(chalk.gray(`   Тип данных: ${typeof data}`))
        console.log(chalk.gray(`   Ключи: ${Object.keys(data).slice(0, 3).join(", ")}...`))

        // Проверяем что папка существует
        if (!fs.existsSync(LOCAL_DATA_DIR)) {
            fs.mkdirSync(LOCAL_DATA_DIR, { recursive: true })
            console.log(chalk.yellow(`   Создана папка: ${LOCAL_DATA_DIR}`))
        }

        // Сохраняем данные
        fs.writeFileSync(targetPath, JSON.stringify(data, null, 2), "utf8")

        // Проверяем что сохранилось
        if (fs.existsSync(targetPath)) {
            const fileInfo = fs.statSync(targetPath)
            const savedData = JSON.parse(fs.readFileSync(targetPath, "utf8"))
            console.log(chalk.green(`✅ Успешно сохранено!`))
            console.log(chalk.gray(`   Размер файла: ${fileInfo.size} байт`))
            console.log(chalk.gray(`   Ключей в файле: ${Object.keys(savedData).length}`))

            // Проверим сохранилось ли наше применение
            let foundApplication = false
            Object.values(savedData).forEach((category) => {
                if (category.articles) {
                    category.articles.forEach((article) => {
                        if (article.id === "keyboard-events" && article.sections) {
                            article.sections.forEach((section) => {
                                if (section.applications && section.applications.length > 0) {
                                    foundApplication = true
                                    console.log(chalk.green(`   🎯 Применение найдено в файле!`))
                                }
                            })
                        }
                    })
                }
            })

            if (!foundApplication) {
                console.log(chalk.red(`   ❌ Применение НЕ найдено в файле!`))
            }
        } else {
            console.log(chalk.red("❌ Файл не был создан!"))
            return false
        }

        return true
    } catch (error) {
        console.log(chalk.red("❌ Ошибка сохранения:"), error.message)
        return false
    }
}

export function loadKnowledgeBase() {
    ensureKnowledgeRepo()
    try {
        const dataFile = findDataFile()
        if (fs.existsSync(dataFile)) {
            const data = JSON.parse(fs.readFileSync(dataFile, "utf8"))
            return data
        } else {
            console.log(chalk.yellow("⚠️  Файл базы знаний не найден!"))
            console.log(chalk.gray(`   Искали: ${CONFIG.BACKUP_FILES.join(", ")}`))
        }
    } catch (error) {
        console.error("❌ Ошибка загрузки:", error.message)
    }
    return null
}

// src/storage.js - добавить эту функцию
export async function validateCommitExists(projectName, commitHash) {
    try {
        // Проверяем коммит через GitHub API
        let apiUrl
        if (projectName.includes("/")) {
            // Формат user/repo
            const [user, repo] = projectName.split("/")
            apiUrl = `https://api.github.com/repos/${user}/${repo}/commits/${commitHash}`
        } else {
            // Предполагаем что это репо текущего пользователя
            apiUrl = `https://api.github.com/repos/ione-chebkn/${projectName}/commits/${commitHash}`
        }

        const response = await fetch(apiUrl)

        if (response.status === 200) {
            const commitData = await response.json()
            return {
                exists: true,
                message: commitData.commit.message,
                author: commitData.commit.author.name,
                date: commitData.commit.author.date,
            }
        } else if (response.status === 404) {
            return { exists: false, error: "Коммит не найден" }
        } else {
            return { exists: false, error: "Ошибка при проверке коммита" }
        }
    } catch (error) {
        console.log(chalk.yellow("⚠️  Не удалось проверить коммит на GitHub"))
        return { exists: true, skipCheck: true } // Пропускаем проверку
    }
}
export function askForConfirmation(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    })

    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close()
            resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes")
        })
    })
}

export function askQuestion(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    })

    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close()
            resolve(answer)
        })
    })
}
