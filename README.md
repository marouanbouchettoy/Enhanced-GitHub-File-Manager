# 📁 Enhanced GitHub File Manager - README

## 🌟 Overview
The Enhanced GitHub File Manager is a powerful web application that allows you to interact with GitHub repositories directly from your browser. With an intuitive interface and responsive design, you can upload, read, manage files, and even create/delete repositories with ease.

**🚀 Live Demo**: [https://marouanbouchettoy.github.io/Enhanced-GitHub-File-Manager/](https://marouanbouchettoy.github.io/Enhanced-GitHub-File-Manager/)

## ✨ Key Features
- **📤 Upload Files/Directories** to GitHub repositories
- **📖 Read Files** directly from repositories
- **🗑️ Delete Files/Directories** from repositories
- **➕ Create New Repositories** (personal or organizational)
- **🗑️ Delete Repositories** (personal or organizational)
- **🔒 Sensitive Data Detection** prevents secret leaks
- **📱 Fully Responsive Design** works on all devices
- **📁 Repository Visualization** with export capability
- **⚙️ Context-Aware Configuration** shows only relevant fields

## 🚀 Getting Started
Access the application directly in your browser:
👉 **[Live Demo](https://marouanbouchettoy.github.io/Enhanced-GitHub-File-Manager/)**

No installation or cloning required!

## 🔧 Configuration
1. **Get a GitHub Token**: 
   - Create at [github.com/settings/tokens](https://github.com/settings/tokens)
   - Select `repo` scope permissions
2. **Enter Configuration**:
   - Token: Your GitHub personal access token
   - Owner: Your username or organization name
   - Repository: The repository to interact with

## 🛠️ Quick Start Guide

### Uploading Files
1. Go to "Upload Files" tab
2. Select files or directory
3. Add commit message
4. Click "Upload to GitHub"

### Managing Repositories
1. **Create Repository**:
   - Go to "Create Repo" tab
   - Enter repository name
   - Click "Create Personal Repository"

2. **Delete Repository**:
   - Go to "Delete Repo" tab
   - Enter repository name
   - Click "Delete Personal Repository"

### Viewing Repository Structure
1. Go to "Manage Files" tab
2. Click "List All Files"
3. Explore the visual file structure

## ⚠️ Important Notes
- Repository deletion is **permanent and irreversible**
- Token is used locally and never stored or transmitted
- Use directory paths ending with `/*` to delete entire directories
- Sensitive data detection helps prevent accidental secret leaks

## 🧠 How It Works
The application uses GitHub's REST API to perform all operations directly from your browser. Your token is used only for the current session and never stored.

## 📜 License
This project is licensed under the MIT License.

---

**Try it now**:  
[https://marouanbouchettoy.github.io/Enhanced-GitHub-File-Manager/](https://marouanbouchettoy.github.io/Enhanced-GitHub-File-Manager/)