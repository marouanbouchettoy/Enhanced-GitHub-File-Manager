// Global variable to store the raw file tree for export
let currentFileTree = "";

// Tab switching functionality
function switchTab(tabName) {
  document
    .querySelectorAll(".tab")
    .forEach((tab) => tab.classList.remove("active"));
  document
    .querySelectorAll(".tab-content")
    .forEach((content) => content.classList.remove("active"));

  event.target.classList.add("active");
  document.getElementById(tabName).classList.add("active");
}

// Toggle file input based on upload type
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

  // Clear previous selection
  fileInput.value = "";
  hideFilePreview();
}

// Show file preview
function showFilePreview(files) {
  const preview = document.getElementById("filePreview");
  const fileList = document.getElementById("fileList");

  if (files.length === 0) {
    hideFilePreview();
    return;
  }

  let html = `<div style="max-height: 150px; overflow-y: auto;">`;
  Array.from(files).forEach((file, index) => {
    const path = file.webkitRelativePath || file.name;
    const size = (file.size / 1024).toFixed(1);
    html += `<div style="margin: 5px 0; padding: 5px; background: white; border-radius: 4px;">
            📄 ${path} <span style="color: #7f8c8d;">(${size} KB)</span>
        </div>`;
  });
  html += `</div>`;
  html += `<div style="margin-top: 10px; font-weight: bold;">Total: ${files.length} files</div>`;

  fileList.innerHTML = html;
  preview.style.display = "block";
}

function hideFilePreview() {
  document.getElementById("filePreview").style.display = "none";
}

// File input change handler
document.getElementById("fileInput").addEventListener("change", function (e) {
  showFilePreview(e.target.files);
});

// Utility functions
function getGlobalConfig() {
  const token = document.getElementById("globalToken").value.trim();
  const owner = document.getElementById("globalOwner").value.trim();
  const repo = document.getElementById("globalRepo").value.trim();

  if (!token || !owner || !repo) {
    throw new Error(
      "Please fill in all GitHub configuration fields (Token, Owner, Repository)"
    );
  }

  return { token, owner, repo };
}

function updateProgress(percent) {
  const progressBar = document.querySelector(".progress-bar");
  const progressFill = document.getElementById("progressFill");

  if (percent > 0) {
    progressBar.style.display = "block";
    progressFill.style.width = percent + "%";
  } else {
    progressBar.style.display = "none";
  }
}

function logOutput(message, type = "info") {
  const output = document.getElementById("output");
  const timestamp = new Date().toLocaleTimeString();
  const icons = { info: "ℹ️", success: "✅", error: "❌", warning: "⚠️" };

  output.textContent += `\n[${timestamp}] ${icons[type] || "ℹ️"} ${message}`;
  output.scrollTop = output.scrollHeight;
}

// Convert Uint8Array to base64 efficiently
function uint8ToBase64(uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.slice(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

// GitHub API functions
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
  const content = atob(fileData.content);
  return { content, sha: fileData.sha };
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
    sha = undefined;
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

// Enhanced secret detection with detailed reporting
function detectSecrets(content, fileName) {
  // Skip binary files or very small files
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

  // Check for actual secret patterns
  for (const { name, pattern } of secretPatterns) {
    const matches = [...content.matchAll(pattern)];
    if (matches.length > 0) {
      for (const match of matches) {
        const fullMatch = match[0];
        const secretValue = match[1] || fullMatch;
        const startPos = match.index;
        const endPos = startPos + fullMatch.length;

        // Get context around the match
        const contextStart = Math.max(0, startPos - 50);
        const contextEnd = Math.min(content.length, endPos + 50);
        const context = content.substring(contextStart, contextEnd);

        // Get line number
        const beforeMatch = content.substring(0, startPos);
        const lineNumber = beforeMatch.split("\n").length;

        foundSecrets.push({
          type: name,
          value:
            secretValue.length > 20
              ? secretValue.substring(0, 10) + "..." + secretValue.slice(-5)
              : secretValue,
          fullValue: secretValue,
          line: lineNumber,
          context: context.replace(/\n/g, " ").trim(),
          position: { start: startPos, end: endPos },
        });
      }
    }
  }

  return {
    hasSecrets: foundSecrets.length > 0,
    secrets: foundSecrets,
  };
}

// Build dynamic file path
function buildFilePath(file, basePath) {
  const relativePath = file.webkitRelativePath || file.name;
  if (!basePath) return relativePath;

  // Clean up base path and combine
  const cleanBasePath = basePath.replace(/^\/+|\/+$/g, "");
  return cleanBasePath ? `${cleanBasePath}/${relativePath}` : relativePath;
}

// Upload form handler
document.getElementById("uploadForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  try {
    const { token, owner, repo } = getGlobalConfig();
    const basePath = document.getElementById("basePath").value.trim();
    let commitMessage = document.getElementById("commitMessage").value.trim();
    const labelsInput = document.getElementById("labels").value.trim();
    const files = document.getElementById("fileInput").files;

    if (!files.length) {
      throw new Error("Please select files or a directory to upload");
    }

    // Append labels to commit message
    if (labelsInput) {
      const labels = labelsInput
        .split(",")
        .map((l) => l.trim())
        .filter((l) => l);
      commitMessage += ` [${labels.join(", ")}]`;
    }

    const uploadBtn = document.getElementById("uploadBtn");
    uploadBtn.disabled = true;
    uploadBtn.textContent = "🔄 Uploading...";

    logOutput(`Starting upload of ${files.length} files...`, "info");
    logOutput(`Repository: ${owner}/${repo}`, "info");
    logOutput(`Base path: ${basePath || "(root)"}`, "info");

    let uploadedCount = 0;
    let skippedCount = 0;
    const totalFiles = files.length;
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

      // Check for text files and secrets
      const text = new TextDecoder().decode(uint8);
      const secretCheck = detectSecrets(text, file.name);

      if (secretCheck.hasSecrets) {
        logOutput(
          `🚨 Sensitive data detected in ${file.name}, skipping upload`,
          "warning"
        );
        sensitiveFiles.push({
          fileName: file.name,
          filePath: filePath,
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
        const progress = Math.round(
          (uploadedCount / (totalFiles - skippedCount)) * 100
        );
        updateProgress(progress);

        logOutput(`✅ Uploaded: ${filePath}`, "success");
      } catch (uploadError) {
        logOutput(
          `❌ Failed to upload ${filePath}: ${uploadError.message}`,
          "error"
        );
        skippedCount++;
      }
    }

    // Summary report
    logOutput(`\n📊 UPLOAD SUMMARY:`, "info");
    logOutput(`✅ Successfully uploaded: ${uploadedCount} files`, "success");
    if (skippedCount > 0) {
      logOutput(`⚠️ Skipped: ${skippedCount} files`, "warning");
    }

    // Detailed sensitive data report
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

    if (uploadedCount > 0) {
      logOutput(
        `🔗 View uploaded files at: https://github.com/${owner}/${repo}`,
        "info"
      );
    }
  } catch (err) {
    logOutput(`❌ Error: ${err.message}`, "error");
  } finally {
    const uploadBtn = document.getElementById("uploadBtn");
    uploadBtn.disabled = false;
    uploadBtn.textContent = "🚀 Upload to GitHub";
    updateProgress(0);
  }
});

// Read form handler
document.getElementById("readForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  try {
    const { token, owner, repo } = getGlobalConfig();
    const filePath = document.getElementById("readPath").value.trim();

    if (!filePath) {
      throw new Error("Please enter a file path to read");
    }

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

// Build visual file tree structure
function buildFileTree(files, repoName) {
  const tree = {};

  // Build tree structure
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

  // Convert tree to visual representation with proper spacing
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
        // It's a file
        const size = value.size
          ? ` (${(value.size / 1024).toFixed(1)} KB)`
          : "";
        result += `${prefix}${connector}📄 ${key}${size}\n`;
      } else {
        // It's a directory
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
// List repository files
async function listRepositoryFiles() {
  try {
    const { token, owner, repo } = getGlobalConfig();

    logOutput("🔍 Loading repository files...", "info");

    // Try main branch first, then master if main doesn't exist
    let url = `https://api.github.com/repos/${owner}/${repo}/git/trees/main?recursive=1`;
    let res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    // If main branch doesn't exist, try master
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

    // Build and display the file tree
    const fileTree = buildFileTree(files, repo);

    // Store the raw tree for export (FIXED)
    currentFileTree = `🌳 Repository Structure (${files.length} files, ${directories.length} directories)\n\n${fileTree}`;

    logOutput(
      `\n🌳 Repository Structure:\n${"═".repeat(50)}\n${fileTree}${"═".repeat(
        50
      )}`,
      "success"
    );
    logOutput(
      `📊 Total: ${files.length} files, ${directories.length} directories`,
      "info"
    );

    // Also update the visual file tree in the UI
    const fileTreeDiv = document.getElementById("fileTree");
    fileTreeDiv.innerHTML = `
            <div style="background: #2c3e50; color: #ecf0f1; padding: 20px; border-radius: 8px; font-family: 'Courier New', monospace; white-space: pre; overflow-x: auto; font-size: 13px; line-height: 1.4;">
                <div style="color: #3498db; font-weight: bold; margin-bottom: 10px;">🌳 Repository Structure (${
                  files.length
                } files, ${directories.length} directories)</div>
                ${fileTree.replace(/\n/g, "<br>")}
            </div>
            <div style="margin-top: 15px;">
                <button onclick="downloadFileTree()" style="background: #27ae60; margin-right: 10px; padding: 8px 16px; border: none; border-radius: 6px; color: white; cursor: pointer;">💾 Export Tree</button>
                <button onclick="refreshFileTree()" style="background: #3498db; padding: 8px 16px; border: none; border-radius: 6px; color: white; cursor: pointer;">🔄 Refresh</button>
                <button onclick="copyFileTree()" style="background: #f39c12; margin-left: 10px; padding: 8px 16px; border: none; border-radius: 6px; color: white; cursor: pointer;">📋 Copy to Clipboard</button>
            </div>
        `;
  } catch (err) {
    logOutput(`❌ Error listing files: ${err.message}`, "error");
    const fileTreeDiv = document.getElementById("fileTree");
    fileTreeDiv.innerHTML = `<div style="color: #e74c3c; padding: 10px;">❌ Error: ${err.message}</div>`;
  }
}

// Helper functions for file tree management
function refreshFileTree() {
  listRepositoryFiles();
}

// FIXED: Download file tree with properly formatted content
function downloadFileTree() {
  try {
    const { owner, repo } = getGlobalConfig();

    if (!currentFileTree) {
      alert("No file tree data available. Please refresh the file tree first.");
      return;
    }

    // Create properly formatted content for download
    const timestamp = new Date().toISOString().split("T")[0];
    const content = `GitHub Repository File Tree Export
Repository: ${owner}/${repo}
Generated: ${timestamp}

${currentFileTree}

---
Generated by Enhanced GitHub File Manager
`;

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
  const outputDiv = document.getElementById("output");
  outputDiv.innerHTML = "";
  logOutput("Console cleared", "info");
}

// NEW: Copy file tree to clipboard
async function copyFileTree() {
  try {
    if (!currentFileTree) {
      alert("No file tree data available. Please refresh the file tree first.");
      return;
    }

    await navigator.clipboard.writeText(currentFileTree);
    logOutput("📋 File tree copied to clipboard!", "success");

    // Visual feedback
    const button = event.target;
    const originalText = button.textContent;
    button.textContent = "✅ Copied!";
    button.style.background = "#27ae60";

    setTimeout(() => {
      button.textContent = originalText;
      button.style.background = "#f39c12";
    }, 2000);
  } catch (err) {
    logOutput(`❌ Error copying to clipboard: ${err.message}`, "error");
    // Fallback: select and copy manually
    const textArea = document.createElement("textarea");
    textArea.value = currentFileTree;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand("copy");
    document.body.removeChild(textArea);
    logOutput("📋 File tree copied to clipboard (fallback method)", "info");
  }
}
