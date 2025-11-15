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
    return DATA_FILE // возвращаем основной путь, даже если файла нет
}

function pushChanges(commitMessage) {
    try {
        execSync("git add knowledge-base.json", { cwd: LOCAL_DATA_DIR })
        execSync(`git commit -m "${commitMessage}"`, { cwd: LOCAL_DATA_DIR })
        execSync("git push", { cwd: LOCAL_DATA_DIR, stdio: "inherit" })
        return true
    } catch (error) {
        console.log("⚠️  Изменения сохранены локально, но не запушены")
        return false
    }
}

export function saveKnowledgeBase(data) {
    ensureKnowledgeRepo()
    try {
        const dataFile = findDataFile()
        fs.writeFileSync(dataFile, JSON.stringify(data, null, 2))
        const commitMsg = `feat: update knowledge - ${new Date().toLocaleString()}`
        pushChanges(commitMsg)
        return true
    } catch (error) {
        console.error("❌ Ошибка сохранения:", error.message)
        return false
    }
}
export function loadKnowledgeBase() {
    ensureKnowledgeRepo()
    try {
        const dataFile = findDataFile()
        if (fs.existsSync(dataFile)) {
            const data = JSON.parse(fs.readFileSync(dataFile, "utf8"))
            console.log(chalk.gray(`📁 Используется файл: ${path.basename(dataFile)}`))
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
