// Configuration globale
let CONFIG = {};
let isRunning = false;
let totalRepos = 0;
let processedRepos = 0;

// Fonction pour logger les messages
function logOutput(message, type = "info") {
  const output = document.getElementById("output");
  const timestamp = new Date().toLocaleTimeString();
  const icons = { info: "ℹ️", success: "✅", error: "❌", warning: "⚠️" };
  output.textContent += `\n[${timestamp}] ${icons[type] || "ℹ️"} ${message}`;
  output.scrollTop = output.scrollHeight;
}

// Fonction pour mettre à jour la barre de progression de copie
function updateCopyProgress() {
  const progressBar = document.getElementById("copyProgressBar");
  const progressFill = document.getElementById("copyProgressFill");
  const repoCount = document.getElementById("repoCount");

  if (totalRepos > 0) {
    progressBar.style.display = "block";
    const percentage = (processedRepos / totalRepos) * 100;
    progressFill.style.width = `${percentage}%`;
    repoCount.textContent = `${processedRepos} / ${totalRepos} repositories processed`;
  }
}

// Fonction pour tester la connexion
async function testConnection() {
  const token = document.getElementById("globalToken").value.trim();
  const sourceOrg = document.getElementById("sourceOrg").value.trim();

  if (!token || !sourceOrg) {
    logOutput("❌ Please fill in the token and source organization", "error");
    return;
  }

  try {
    logOutput("🔍 Testing connection...", "info");

    const response = await axios.get(
      `https://api.github.com/orgs/${sourceOrg}`,
      {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );

    logOutput(
      `✅ Connection successful! Organization: ${response.data.login}`,
      "success"
    );
    logOutput(`📊 Public repositories: ${response.data.public_repos}`, "info");
  } catch (error) {
    logOutput(
      `❌ Connection error: ${error.response?.data?.message || error.message}`,
      "error"
    );
  }
}

// Fonction pour obtenir tous les repositories
async function getAllRepositories(org, token) {
  const repos = [];
  let page = 1;
  let hasNextPage = true;

  while (hasNextPage) {
    try {
      const response = await axios.get(
        `https://api.github.com/orgs/${org}/repos`,
        {
          headers: {
            Authorization: `token ${token}`,
            Accept: "application/vnd.github.v3+json",
          },
          params: {
            per_page: 100,
            page: page,
          },
        }
      );

      repos.push(...response.data);
      hasNextPage = response.data.length === 100;
      page++;

      logOutput(
        `📄 Page ${page - 1} loaded (${response.data.length} repos)`,
        "info"
      );
    } catch (error) {
      logOutput(`❌ Error retrieving repos: ${error.message}`, "error");
      break;
    }
  }

  return repos;
}

// Fonction pour créer un repository
async function createRepository(sourceRepo, targetOrg, token) {
  try {
    const response = await axios.post(
      `https://api.github.com/orgs/${targetOrg}/repos`,
      {
        name: sourceRepo.name,
        description: sourceRepo.description || "",
        private: sourceRepo.private,
        has_issues: sourceRepo.has_issues,
        has_projects: sourceRepo.has_projects,
        has_wiki: sourceRepo.has_wiki,
        has_downloads: sourceRepo.has_downloads,
        default_branch: sourceRepo.default_branch,
      },
      {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );

    return response.data;
  } catch (error) {
    if (error.response?.status === 422) {
      logOutput(
        `⚠️ Repository ${sourceRepo.name} already exists in ${targetOrg}`,
        "warning"
      );
      return null;
    }
    throw error;
  }
}

// Fonction pour copier les fichiers récursivement
async function copyFilesRecursively(
  sourceOwner,
  sourceRepo,
  targetOwner,
  targetRepo,
  token
) {
  try {
    logOutput(`  📁 Copying files...`, "info");

    // Obtenir la liste des fichiers dans le repo source
    const contents = await getRepositoryContents(
      sourceOwner,
      sourceRepo,
      "",
      token
    );

    if (!contents || contents.length === 0) {
      logOutput(`  ⚠️ No files found in ${sourceRepo}`, "warning");
      return;
    }

    let copiedFiles = 0;

    // Copier chaque fichier
    for (const item of contents) {
      await copyFileOrDirectory(
        sourceOwner,
        sourceRepo,
        targetOwner,
        targetRepo,
        item,
        token
      );
      copiedFiles++;

      // Petite pause entre les fichiers
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    logOutput(`  ✅ ${copiedFiles} items copied`, "success");
  } catch (error) {
    logOutput(`  ❌ Error copying files: ${error.message}`, "error");
  }
}

// Fonction pour obtenir le contenu d'un repository
async function getRepositoryContents(owner, repo, path, token) {
  try {
    const response = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
      {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );
    return response.data;
  } catch (error) {
    logOutput(`❌ Error retrieving content: ${error.message}`, "error");
    return null;
  }
}

// Fonction pour copier un fichier ou dossier
async function copyFileOrDirectory(
  sourceOwner,
  sourceRepo,
  targetOwner,
  targetRepo,
  item,
  token
) {
  try {
    if (item.type === "file") {
      // Copier un fichier
      const fileContent = await getFileContent(
        sourceOwner,
        sourceRepo,
        item.path,
        token
      );
      if (fileContent) {
        await createOrUpdateFile(
          targetOwner,
          targetRepo,
          item.path,
          fileContent.content,
          `Add ${item.name}`,
          token
        );
        logOutput(`    ✅ ${item.name}`, "success");
      }
    } else if (item.type === "dir") {
      // Copier un dossier récursivement
      logOutput(`    📁 Folder: ${item.name}`, "info");
      const subContents = await getRepositoryContents(
        sourceOwner,
        sourceRepo,
        item.path,
        token
      );
      if (subContents) {
        for (const subItem of subContents) {
          await copyFileOrDirectory(
            sourceOwner,
            sourceRepo,
            targetOwner,
            targetRepo,
            subItem,
            token
          );
        }
      }
    }
  } catch (error) {
    logOutput(`    ❌ Error copying ${item.name}: ${error.message}`, "error");
  }
}

// Fonction pour obtenir le contenu d'un fichier
async function getFileContent(owner, repo, path, token) {
  try {
    const response = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
      {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );
    return response.data;
  } catch (error) {
    logOutput(`❌ Error retrieving file ${path}: ${error.message}`, "error");
    return null;
  }
}

// Fonction pour créer ou mettre à jour un fichier
async function createOrUpdateFile(owner, repo, path, content, message, token) {
  try {
    const response = await axios.put(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
      {
        message: message,
        content: content,
      },
      {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );
    return response.data;
  } catch (error) {
    // Si le fichier existe déjà, essayer de le mettre à jour
    if (error.response?.status === 422) {
      try {
        // Obtenir le SHA du fichier existant
        const existingFile = await getFileContent(owner, repo, path, token);
        if (existingFile) {
          const updateResponse = await axios.put(
            `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
            {
              message: `Update ${path}`,
              content: content,
              sha: existingFile.sha,
            },
            {
              headers: {
                Authorization: `token ${token}`,
                Accept: "application/vnd.github.v3+json",
              },
            }
          );
          return updateResponse.data;
        }
      } catch (updateError) {
        logOutput(`❌ Error updating file: ${updateError.message}`, "error");
      }
    }
    throw error;
  }
}

// Version alternative plus simple : utiliser l'API de copie directe
async function copyRepositorySimple(sourceRepo, targetOrg, token) {
  try {
    logOutput(`📦 Processing: ${sourceRepo.name}`, "info");

    // Méthode 1: Essayer la création avec un README initial
    try {
      const newRepo = await axios.post(
        `https://api.github.com/orgs/${targetOrg}/repos`,
        {
          name: sourceRepo.name,
          description: sourceRepo.description || "",
          private: sourceRepo.private,
          has_issues: sourceRepo.has_issues,
          has_projects: sourceRepo.has_projects,
          has_wiki: sourceRepo.has_wiki,
          has_downloads: sourceRepo.has_downloads,
          auto_init: true, // Créer avec un README initial
          default_branch: sourceRepo.default_branch || "main",
        },
        {
          headers: {
            Authorization: `token ${token}`,
            Accept: "application/vnd.github.v3+json",
          },
        }
      );

      logOutput(
        `✅ Repository ${sourceRepo.name} created with initial branch`,
        "success"
      );
      logOutput(`🔗 URL: ${newRepo.data.html_url}`, "info");

      // Maintenant copier les fichiers un par un
      await copyFilesRecursively(
        CONFIG.sourceOrg,
        sourceRepo.name,
        targetOrg,
        sourceRepo.name,
        token
      );
    } catch (error) {
      if (error.response?.status === 422) {
        logOutput(`⚠️ Repository ${sourceRepo.name} already exists`, "warning");
      } else {
        throw error;
      }
    }

    processedRepos++;
    updateCopyProgress();

    // Délai pour éviter les limitations de taux
    await new Promise((resolve) => setTimeout(resolve, 2000));
  } catch (error) {
    logOutput(`❌ Error copying ${sourceRepo.name}: ${error.message}`, "error");
    processedRepos++;
    updateCopyProgress();
  }
}

// Fonction principale pour démarrer la copie
async function startCopy() {
  if (isRunning) return;

  const token = document.getElementById("globalToken").value.trim();
  const sourceOrg = document.getElementById("sourceOrg").value.trim();
  const targetOrg = document.getElementById("targetOrg").value.trim();
  const specificRepos = document.getElementById("specificRepos").value;

  if (!token || !sourceOrg || !targetOrg) {
    logOutput("❌ Please fill in all required fields", "error");
    return;
  }

  CONFIG = { token, sourceOrg, targetOrg };
  isRunning = true;
  processedRepos = 0;

  // Désactiver les boutons
  document
    .querySelectorAll("#copyRepoForm button")
    .forEach((btn) => (btn.disabled = true));

  try {
    logOutput(`🚀 Starting copy from ${sourceOrg} to ${targetOrg}`, "info");

    let repos = [];

    if (specificRepos.trim()) {
      // Copier des repositories spécifiques
      const repoNames = specificRepos
        .split(",")
        .map((name) => name.trim())
        .filter((name) => name);
      logOutput(`📋 Copying ${repoNames.length} specific repositories`, "info");

      for (const repoName of repoNames) {
        try {
          const response = await axios.get(
            `https://api.github.com/repos/${sourceOrg}/${repoName}`,
            {
              headers: {
                Authorization: `token ${token}`,
                Accept: "application/vnd.github.v3+json",
              },
            }
          );
          repos.push(response.data);
        } catch (error) {
          logOutput(`❌ Repository ${repoName} not found`, "error");
        }
      }
    } else {
      // Obtenir tous les repositories
      repos = await getAllRepositories(sourceOrg, token);
    }

    totalRepos = repos.length;
    logOutput(`📋 ${totalRepos} repositories found`, "info");

    // Copier chaque repository
    for (const repo of repos) {
      if (!isRunning) break; // Permettre l'arrêt
      await copyRepositorySimple(repo, targetOrg, token);
    }

    logOutput("🎉 Copy process completed!", "success");
  } catch (error) {
    logOutput(`💥 Error during copy: ${error.message}`, "error");
  } finally {
    isRunning = false;
    // Réactiver les boutons
    document
      .querySelectorAll("#copyRepoForm button")
      .forEach((btn) => (btn.disabled = false));
  }
}

// Fonction pour effacer les logs de copie
function clearCopyLogs() {
  const output = document.getElementById("output");
  output.textContent = "Console cleared\n";
  logOutput("📋 Ready to start...", "info");

  // Réinitialiser la barre de progression
  const progressBar = document.getElementById("copyProgressBar");
  const repoCount = document.getElementById("repoCount");
  progressBar.style.display = "none";
  repoCount.textContent = "";

  processedRepos = 0;
  totalRepos = 0;
}

// ==============
// EXISTING CODE
// ==============

let currentFileTree = "";
let repoOutputElement = document.getElementById("repoOutput");

function switchTab(tabName) {
  document
    .querySelectorAll(".tab")
    .forEach((tab) => tab.classList.remove("active"));
  document
    .querySelectorAll(".tab-content")
    .forEach((content) => content.classList.remove("active"));
  event.target.classList.add("active");
  document.getElementById(tabName).classList.add("active");

  // Afficher/masquer les champs de configuration
  updateConfigFields(tabName);
}

function updateConfigFields(activeTab) {
  const tokenField = document.querySelector(".field-token");
  const ownerField = document.querySelector(".field-owner");
  const repoField = document.querySelector(".field-repo");

  // Réinitialiser tous les champs
  tokenField.style.display = "block";
  ownerField.style.display = "block";
  repoField.style.display = "block";

  // Masquer les champs non nécessaires selon l'onglet
  if (
    activeTab === "repoTab" ||
    activeTab === "removeRepoTab" ||
    activeTab === "copyRepoTab"
  ) {
    ownerField.style.display = "none";
    repoField.style.display = "none";
  }
}

// Initialiser les champs au chargement
document.addEventListener("DOMContentLoaded", function () {
  updateConfigFields("uploadTab");
});

function toggleFileInput() {
  const uploadType = document.getElementById("uploadType").value;
  const fileInput = document.getElementById("fileInput");
  const label = document.getElementById("fileInputLabel");
  if (uploadType === "directory") {
    fileInput.setAttribute("webkitdirectory", "");
    fileInput.setAttribute("directory", "");
    label.textContent = "Select Directory:";
  } else {
    fileInput.removeAttribute("webkitdirectory");
    fileInput.removeAttribute("directory");
    label.textContent = "Select Files:";
  }
  fileInput.value = "";
  hideFilePreview();
}

function showFilePreview(files) {
  const preview = document.getElementById("filePreview");
  const fileList = document.getElementById("fileList");
  if (files.length === 0) {
    hideFilePreview();
    return;
  }
  let html = `<div style="max-height: 150px; overflow-y: auto;">`;
  Array.from(files).forEach((file) => {
    const path = file.webkitRelativePath || file.name;
    const size = (file.size / 1024).toFixed(1);
    html += `<div style="margin: 5px 0; padding: 5px; background: white; border-radius: 4px;">
                            📄 ${path} <span style="color: #7f8c8d;">(${size} KB)</span>
                        </div>`;
  });
  html += `</div><div style="margin-top: 10px; font-weight: bold;">Total: ${files.length} files</div>`;
  fileList.innerHTML = html;
  preview.style.display = "block";
}

function hideFilePreview() {
  document.getElementById("filePreview").style.display = "none";
}

document
  .getElementById("fileInput")
  .addEventListener("change", (e) => showFilePreview(e.target.files));

function getGlobalConfig() {
  const token = document.getElementById("globalToken").value.trim();
  const owner = document.getElementById("globalOwner").value.trim();
  const repo = document.getElementById("globalRepo").value.trim();
  if (!token || !owner || !repo)
    throw new Error("Please fill in all GitHub configuration fields");
  return { token, owner, repo };
}

function updateProgress(percent) {
  const progressBar = document.querySelector(".progress-bar");
  const progressFill = document.getElementById("progressFill");
  progressBar.style.display = percent > 0 ? "block" : "none";
  progressFill.style.width = percent + "%";
}

function uint8ToBase64(uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      uint8Array.slice(i, i + chunkSize)
    );
  }
  return btoa(binary);
}

async function getFromGitHub(token, owner, repo, filePath) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
    },
  });
  if (!res.ok) throw new Error(`Failed to read file: ${res.statusText}`);
  const fileData = await res.json();
  return { content: atob(fileData.content), sha: fileData.sha };
}

async function uploadToGitHub(
  token,
  owner,
  repo,
  filePath,
  content,
  commitMessage,
  isAlreadyBase64 = false
) {
  let sha;
  try {
    const existing = await getFromGitHub(token, owner, repo, filePath);
    sha = existing.sha;
    logOutput(`File ${filePath} exists, will update`, "warning");
  } catch {
    logOutput(`File ${filePath} is new, will create`, "info");
  }
  const encoded = isAlreadyBase64 ? content : btoa(content);
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
    },
    body: JSON.stringify({
      message: commitMessage,
      content: encoded,
      ...(sha && { sha }),
    }),
  });
  const result = await res.json();
  if (!res.ok)
    throw new Error(
      `Upload failed for ${filePath}: ${result.message || "Unknown error"}`
    );
  return result;
}

async function deleteFromGitHub(token, owner, repo, filePath, commitMessage) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
  let sha;
  try {
    const existing = await getFromGitHub(token, owner, repo, filePath);
    sha = existing.sha;
    logOutput(`File ${filePath} exists, will delete`, "info");
  } catch {
    throw new Error(`File ${filePath} does not exist in the repository`);
  }
  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
    },
    body: JSON.stringify({ message: commitMessage, sha }),
  });
  const result = await res.json();
  if (!res.ok)
    throw new Error(
      `Delete failed for ${filePath}: ${result.message || "Unknown error"}`
    );
  return result;
}

async function listDirectoryFiles(token, owner, repo, dirPath) {
  let url = `https://api.github.com/repos/${owner}/${repo}/git/trees/main?recursive=1`;
  let res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
    },
  });
  if (!res.ok && res.status === 404) {
    url = `https://api.github.com/repos/${owner}/${repo}/git/trees/master?recursive=1`;
    res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    });
  }
  if (!res.ok) throw new Error(`Failed to list directory: ${res.statusText}`);
  const data = await res.json();
  const cleanDirPath = dirPath.replace(/\/*\*$/, "");
  return data.tree
    .filter(
      (item) => item.type === "blob" && item.path.startsWith(cleanDirPath)
    )
    .map((item) => ({ path: item.path, sha: item.sha }));
}

function detectSecrets(content, fileName) {
  if (content.length < 10) return { hasSecrets: false, secrets: [] };
  const secretPatterns = [
    {
      name: "API Key Assignment",
      pattern:
        /(?:github_token|gh_token|api_key|secret_key|private_key|access_token)\s*[:=]\s*['"]?([a-zA-Z0-9+/]{20,})['"]?/gi,
    },
    { name: "GitHub Personal Access Token", pattern: /(ghp_[a-zA-Z0-9]{36})/g },
    { name: "GitHub OAuth Token", pattern: /(gho_[a-zA-Z0-9]{36})/g },
    { name: "GitHub User Token", pattern: /(ghu_[a-zA-Z0-9]{36})/g },
    { name: "GitHub Server Token", pattern: /(ghs_[a-zA-Z0-9]{36})/g },
    { name: "OpenAI API Key", pattern: /(sk-[a-zA-Z0-9]{48})/g },
    { name: "AWS Access Key", pattern: /(AKIA[0-9A-Z]{16})/g },
    { name: "Google API Key", pattern: /(AIza[0-9A-Za-z_-]{35})/g },
    {
      name: "Slack Bot Token",
      pattern: /(xoxb-[0-9]{11,12}-[0-9]{11,12}-[a-zA-Z0-9]{24})/g,
    },
    {
      name: "Slack User Token",
      pattern: /(xoxp-[0-9]{11,12}-[0-9]{11,12}-[a-zA-Z0-9]{24})/g,
    },
    {
      name: "Generic Secret Pattern",
      pattern:
        /(?:password|secret|bearer)\s*[:=]\s*['"]?([a-zA-Z0-9+/!@#$%^&*()_+-=]{15,})['"]?/gi,
    },
  ];
  const foundSecrets = [];
  for (const { name, pattern } of secretPatterns) {
    const matches = [...content.matchAll(pattern)];
    for (const match of matches) {
      const fullMatch = match[0];
      const secretValue = match[1] || fullMatch;
      const startPos = match.index;
      const contextStart = Math.max(0, startPos - 50);
      const contextEnd = Math.min(
        content.length,
        startPos + fullMatch.length + 50
      );
      const context = content
        .substring(contextStart, contextEnd)
        .replace(/\n/g, " ")
        .trim();
      const lineNumber = content.substring(0, startPos).split("\n").length;
      foundSecrets.push({
        type: name,
        value:
          secretValue.length > 20
            ? secretValue.substring(0, 10) + "..." + secretValue.slice(-5)
            : secretValue,
        fullValue: secretValue,
        line: lineNumber,
        context,
      });
    }
  }
  return { hasSecrets: foundSecrets.length > 0, secrets: foundSecrets };
}

function buildFilePath(file, basePath) {
  const relativePath = file.webkitRelativePath || file.name;
  if (!basePath) return relativePath;
  const cleanBasePath = basePath.replace(/^\/+|\/+$/g, "");
  return cleanBasePath ? `${cleanBasePath}/${relativePath}` : relativePath;
}

document.getElementById("uploadForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const { token, owner, repo } = getGlobalConfig();
    const basePath = document.getElementById("basePath").value.trim();
    let commitMessage = document.getElementById("commitMessage").value.trim();
    const labelsInput = document.getElementById("labels").value.trim();
    const files = document.getElementById("fileInput").files;
    if (!files.length)
      throw new Error("Please select files or a directory to upload");
    if (labelsInput)
      commitMessage += ` [${labelsInput
        .split(",")
        .map((l) => l.trim())
        .filter((l) => l)
        .join(", ")}]`;
    const uploadBtn = document.getElementById("uploadBtn");
    uploadBtn.disabled = true;
    uploadBtn.textContent = "🔄 Uploading...";
    logOutput(`Starting upload of ${files.length} files...`, "info");
    logOutput(`Repository: ${owner}/${repo}`, "info");
    logOutput(`Base path: ${basePath || "(root)"}`, "info");
    let uploadedCount = 0,
      skippedCount = 0;
    const sensitiveFiles = [];
    for (const file of files) {
      if (file.size === 0) {
        logOutput(`Skipped empty file: ${file.name}`, "warning");
        skippedCount++;
        continue;
      }
      const filePath = buildFilePath(file, basePath);
      logOutput(`Processing: ${filePath}`, "info");
      const arrayBuffer = await file.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);
      const text = new TextDecoder().decode(uint8);
      const secretCheck = detectSecrets(text, file.name);
      if (secretCheck.hasSecrets) {
        logOutput(
          `🚨 Sensitive data detected in ${file.name}, skipping upload`,
          "warning"
        );
        sensitiveFiles.push({
          fileName: file.name,
          filePath,
          secrets: secretCheck.secrets,
        });
        skippedCount++;
        continue;
      }
      try {
        const base64Content = uint8ToBase64(uint8);
        await uploadToGitHub(
          token,
          owner,
          repo,
          filePath,
          base64Content,
          commitMessage,
          true
        );
        uploadedCount++;
        updateProgress(
          Math.round((uploadedCount / (files.length - skippedCount)) * 100)
        );
        logOutput(`✅ Uploaded: ${filePath}`, "success");
      } catch (uploadError) {
        logOutput(
          `❌ Failed to upload ${filePath}: ${uploadError.message}`,
          "error"
        );
        skippedCount++;
      }
    }
    logOutput(`\n📊 UPLOAD SUMMARY:`, "info");
    logOutput(`✅ Successfully uploaded: ${uploadedCount} files`, "success");
    if (skippedCount > 0)
      logOutput(`⚠️ Skipped: ${skippedCount} files`, "warning");
    if (sensitiveFiles.length > 0) {
      logOutput(`\n🔍 SENSITIVE DATA REPORT:`, "warning");
      logOutput(
        `Found sensitive data in ${sensitiveFiles.length} file(s):`,
        "warning"
      );
      sensitiveFiles.forEach((file) => {
        logOutput(`\n📄 File: ${file.fileName}`, "warning");
        file.secrets.forEach((secret, index) => {
          logOutput(
            `  ${index + 1}. ${secret.type} (Line ${secret.line})`,
            "warning"
          );
          logOutput(`     Value: ${secret.value}`, "warning");
          logOutput(`     Context: ${secret.context}`, "warning");
        });
      });
      logOutput(
        `\n💡 TO FIX: Remove or replace the sensitive values above and try uploading again.`,
        "info"
      );
    }
    if (uploadedCount > 0)
      logOutput(
        `🔗 View uploaded files at: https://github.com/${owner}/${repo}`,
        "info"
      );
  } catch (err) {
    logOutput(`❌ Error: ${err.message}`, "error");
  } finally {
    const uploadBtn = document.getElementById("uploadBtn");
    uploadBtn.disabled = false;
    uploadBtn.textContent = "🚀 Upload to GitHub";
    updateProgress(0);
  }
});

document.getElementById("readForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const { token, owner, repo } = getGlobalConfig();
    const filePath = document.getElementById("readPath").value.trim();
    if (!filePath) throw new Error("Please enter a file path to read");
    logOutput(`Reading file: ${filePath}`, "info");
    const { content } = await getFromGitHub(token, owner, repo, filePath);
    logOutput(
      `📄 File Content (${filePath}):\n${"=".repeat(
        50
      )}\n${content}\n${"=".repeat(50)}`,
      "success"
    );
  } catch (err) {
    logOutput(`❌ Error reading file: ${err.message}`, "error");
  }
});

document.getElementById("deleteForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const { token, owner, repo } = getGlobalConfig();
    let filePath = document.getElementById("deletePath").value.trim();
    const commitMessage =
      document.getElementById("deleteCommitMessage").value.trim() ||
      `Delete ${filePath}`;
    const deleteBtn = document
      .getElementById("deleteForm")
      .querySelector("button");
    deleteBtn.disabled = true;
    deleteBtn.textContent = "🔄 Deleting...";

    if (!filePath)
      throw new Error("Please enter a file or directory path to delete");

    if (filePath.endsWith("/*")) {
      logOutput(`Deleting directory: ${filePath}`, "info");
      const files = await listDirectoryFiles(token, owner, repo, filePath);
      if (files.length === 0) {
        logOutput(`No files found in ${filePath}`, "warning");
        return;
      }

      let deletedCount = 0;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        logOutput(`Deleting: ${file.path}`, "info");
        try {
          await deleteFromGitHub(
            token,
            owner,
            repo,
            file.path,
            `${commitMessage} (file ${i + 1}/${files.length})`
          );
          deletedCount++;
          updateProgress(Math.round((deletedCount / files.length) * 100));
          logOutput(`🗑️ Successfully deleted: ${file.path}`, "success");
        } catch (err) {
          logOutput(
            `❌ Failed to delete ${file.path}: ${err.message}`,
            "error"
          );
        }
      }
      logOutput(`\n📊 DELETE SUMMARY:`, "info");
      logOutput(`🗑️ Successfully deleted: ${deletedCount} files`, "success");
      if (deletedCount < files.length) {
        logOutput(
          `⚠️ Failed to delete: ${files.length - deletedCount} files`,
          "warning"
        );
      }
    } else {
      logOutput(`Deleting file: ${filePath}`, "info");
      await deleteFromGitHub(token, owner, repo, filePath, commitMessage);
      logOutput(`🗑️ Successfully deleted: ${filePath}`, "success");
    }
  } catch (err) {
    logOutput(`❌ Error deleting: ${err.message}`, "error");
  } finally {
    const deleteBtn = document
      .getElementById("deleteForm")
      .querySelector("button");
    deleteBtn.disabled = false;
    deleteBtn.textContent = "🗑️ Delete File";
    updateProgress(0);
  }
});

function buildFileTree(files, repoName) {
  const tree = {};
  files.forEach((file) => {
    const parts = file.path.split("/");
    let current = tree;
    parts.forEach((part, index) => {
      if (!current[part]) {
        current[part] =
          index === parts.length - 1 ? { __file: true, size: file.size } : {};
      }
      current = current[part];
    });
  });
  function renderTree(obj, prefix = "", isLast = true, level = 0) {
    let result = "";
    const entries = Object.entries(obj).filter(
      ([key]) => key !== "__file" && key !== "size"
    );
    entries.forEach(([key, value], index) => {
      const isLastEntry = index === entries.length - 1;
      const connector = isLastEntry ? "└── " : "├── ";
      const nextPrefix = prefix + (isLastEntry ? "    " : "│   ");
      if (value.__file) {
        const size = value.size
          ? ` (${(value.size / 1024).toFixed(1)} KB)`
          : "";
        result += `${prefix}${connector}📄 ${key}${size}\n`;
      } else {
        result += `${prefix}${connector}📁 ${key}/\n`;
        result += renderTree(value, nextPrefix, isLastEntry, level + 1);
      }
    });
    return result;
  }
  let treeOutput = `📁 ${repoName}/\n`;
  treeOutput += renderTree(tree);
  return treeOutput;
}

async function listRepositoryFiles() {
  try {
    const { token, owner, repo } = getGlobalConfig();
    logOutput("🔍 Loading repository files...", "info");
    let url = `https://api.github.com/repos/${owner}/${repo}/git/trees/main?recursive=1`;
    let res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    });
    if (!res.ok && res.status === 404) {
      url = `https://api.github.com/repos/${owner}/${repo}/git/trees/master?recursive=1`;
      res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
        },
      });
    }
    if (!res.ok) throw new Error(`Failed to list files: ${res.statusText}`);
    const data = await res.json();
    const files = data.tree.filter((item) => item.type === "blob");
    const directories = data.tree.filter((item) => item.type === "tree");
    if (files.length === 0) {
      logOutput("📂 Repository is empty or has no files", "info");
      return;
    }
    currentFileTree = `\n${buildFileTree(files, repo)}`;
    logOutput(
      `\n🌳 Repository Structure:\n${"═".repeat(
        50
      )}\n${currentFileTree}${"═".repeat(50)}`,
      "success"
    );
    logOutput(
      `📊 Total: ${files.length} files, ${directories.length} directories`,
      "info"
    );
    document.getElementById("fileTree").innerHTML = `
                    <div style="background: #2c3e50; color: #ecf0f1; padding: 20px; border-radius: 8px; font-family: 'Courier New', monospace; white-space: pre; overflow-x: auto; font-size: 13px; line-height: 1.4;">
                        <div style="color: #3498db; font-weight: bold; margin-bottom: 10px;">🌳 Repository Structure (${
                          files.length
                        } files, ${directories.length} directories)</div>
                        ${currentFileTree.replace(/\n/g, "<br>")}
                    </div>
                    <div style="margin-top: 15px;">
                        <button onclick="downloadFileTree()" style="background: #27ae60; margin-right: 10px; padding: 8px 16px; border: none; border-radius: 6px; color: white; cursor: pointer;">💾 Export Tree</button>
                        <button onclick="refreshFileTree()" style="background: #3498db; padding: 8px 16px; border: none; border-radius: 6px; color: white; cursor: pointer;">🔄 Refresh</button>
                    </div>
                `;
  } catch (err) {
    logOutput(`❌ Error listing files: ${err.message}`, "error");
    document.getElementById(
      "fileTree"
    ).innerHTML = `<div style="color: #e74c3c; padding: 10px;">❌ Error: ${err.message}</div>`;
  }
}

function refreshFileTree() {
  listRepositoryFiles();
}

function downloadFileTree() {
  try {
    const { owner, repo } = getGlobalConfig();
    if (!currentFileTree)
      throw new Error(
        "No file tree data available. Please refresh the file tree first."
      );
    const timestamp = new Date().toISOString().split("T")[0];
    const content = `GitHub Repository File Tree Export\nRepository: ${owner}/${repo}\nGenerated: ${timestamp}\n\n${currentFileTree}\n\n---\nGenerated by Enhanced GitHub File Manager`;
    const blob = new Blob([content], { type: "text/plain; charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${repo}-file-tree-${timestamp}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    logOutput(
      `📁 File tree exported as: ${repo}-file-tree-${timestamp}.txt`,
      "success"
    );
  } catch (err) {
    logOutput(`❌ Error exporting file tree: ${err.message}`, "error");
  }
}

function clearConsole() {
  document.getElementById("output").textContent = "Console cleared\n";
  logOutput("Ready to start...", "info");
}

// ====================
// NEW REPO FUNCTIONS
// ====================

function showRepoMessage(message, isError = false) {
  const output = repoOutputElement;
  output.innerHTML = `<div class="${
    isError ? "error" : "success"
  }">${message}</div>`;
}

async function githubRequest(url, method, token, body = null) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const config = { method, headers };
  if (body) config.body = JSON.stringify(body);
  try {
    const response = await fetch(url, config);
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        `Error ${response.status}: ${
          error.message || "Unknown error"
        } (URL: ${url})`
      );
    }
    return response.json();
  } catch (error) {
    console.error("API Error:", error);
    throw error;
  }
}

async function createPersonalRepo() {
  const token = document.getElementById("globalToken").value.trim();
  const repoName = document.getElementById("repoName").value.trim();
  if (!token || !repoName) {
    showRepoMessage("Please enter a token and repository name.", true);
    return;
  }
  try {
    const data = await githubRequest(
      "https://api.github.com/user/repos",
      "POST",
      token,
      {
        name: repoName,
        private: false,
      }
    );
    showRepoMessage(`Repository created: ${data.html_url}`);
    logOutput(`✅ Personal repository created: ${repoName}`, "success");
  } catch (error) {
    showRepoMessage(`Error: ${error.message}`, true);
    logOutput(
      `❌ Error creating personal repository: ${error.message}`,
      "error"
    );
  }
}

async function checkOrgPermissions() {
  const token = document.getElementById("globalToken").value.trim();
  const orgName = document.getElementById("checkOrg").value.trim();
  if (!token || !orgName) {
    showRepoMessage("Please enter a token and organization name.", true);
    return;
  }
  try {
    const user = await githubRequest(
      "https://api.github.com/user",
      "GET",
      token
    );
    const data = await githubRequest(
      `https://api.github.com/orgs/${orgName}/memberships/${user.login}`,
      "GET",
      token
    );
    const canCreate = data.role === "admin";
    showRepoMessage(
      `Permissions: ${data.role}. Can create repositories: ${canCreate}`
    );
    logOutput(
      `🔍 Organization permissions checked: ${data.role} (can create: ${canCreate})`,
      "info"
    );
    return canCreate;
  } catch (error) {
    showRepoMessage(`Error: ${error.message}`, true);
    logOutput(
      `❌ Error checking organization permissions: ${error.message}`,
      "error"
    );
    return false;
  }
}

async function createOrgRepo() {
  const token = document.getElementById("globalToken").value.trim();
  const repoName = document.getElementById("orgRepoName").value.trim();
  const orgName = document.getElementById("orgForRepo").value.trim();
  if (!token || !repoName || !orgName) {
    showRepoMessage(
      "Please enter a token, repository name and organization name.",
      true
    );
    return;
  }
  try {
    const canCreate = await checkOrgPermissions();
    if (canCreate) {
      const data = await githubRequest(
        `https://api.github.com/orgs/${orgName}/repos`,
        "POST",
        token,
        {
          name: repoName,
          private: false,
        }
      );
      showRepoMessage(`Repository created in organization: ${data.html_url}`);
      logOutput(
        `✅ Organization repository created: ${orgName}/${repoName}`,
        "success"
      );
    } else {
      showRepoMessage(
        "You do not have permission to create repositories in this organization.",
        true
      );
      logOutput(
        `❌ Permission denied to create repository in organization: ${orgName}`,
        "error"
      );
    }
  } catch (error) {
    showRepoMessage(`Error: ${error.message}`, true);
    logOutput(
      `❌ Error creating organization repository: ${error.message}`,
      "error"
    );
  }
}

// ====================
// DELETE REPO FUNCTIONS
// ====================

async function deletePersonalRepo() {
  const token = document.getElementById("globalToken").value.trim();
  const repoName = document.getElementById("deleteRepoName").value.trim();
  if (!token || !repoName) {
    showRepoMessage("Please enter a token and repository name.", true);
    return;
  }

  try {
    // Get current username
    const user = await githubRequest(
      "https://api.github.com/user",
      "GET",
      token
    );

    if (
      !confirm(
        `Are you SURE you want to PERMANENTLY delete "${repoName}"? This action cannot be undone.`
      )
    ) {
      return;
    }

    await githubRequest(
      `https://api.github.com/repos/${user.login}/${repoName}`,
      "DELETE",
      token
    );

    showRepoMessage(`Repository "${repoName}" deleted successfully.`);
    logOutput(`✅ Personal repository deleted: ${repoName}`, "success");
  } catch (error) {
    showRepoMessage(`Error: ${error.message}`, true);
    logOutput(
      `❌ Error deleting personal repository: ${error.message}`,
      "error"
    );
  }
}

async function deleteOrgRepo() {
  const token = document.getElementById("globalToken").value.trim();
  const repoName = document.getElementById("deleteOrgRepoName").value.trim();
  const orgName = document.getElementById("deleteOrgForRepo").value.trim();
  if (!token || !repoName || !orgName) {
    showRepoMessage(
      "Please enter a token, repository name and organization name.",
      true
    );
    return;
  }

  try {
    if (
      !confirm(
        `Are you SURE you want to PERMANENTLY delete "${orgName}/${repoName}"? This action cannot be undone.`
      )
    ) {
      return;
    }

    await githubRequest(
      `https://api.github.com/repos/${orgName}/${repoName}`,
      "DELETE",
      token
    );

    showRepoMessage(
      `Repository "${orgName}/${repoName}" deleted successfully.`
    );
    logOutput(
      `✅ Organization repository deleted: ${orgName}/${repoName}`,
      "success"
    );
  } catch (error) {
    showRepoMessage(`Error: ${error.message}`, true);
    logOutput(
      `❌ Error deleting organization repository: ${error.message}`,
      "error"
    );
  }
}

// Initialisation
logOutput("🚀 Enhanced GitHub File Manager ready!", "success");
logOutput("💡 Tip: Ctrl+Enter to start copying repositories quickly", "info");
logOutput("📦 This version can copy entire repositories with content", "info");
