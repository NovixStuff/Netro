# 🌐 Netro – Local Tools for Your Online World

**Netro** is a passion project developed by **NovixStuff** to bring you a customizable, local interface for exploring Roblox without the need for browser extensions to improve your experience.

---

## 🚀 What is Netro?

Netro is a lightweight local server that runs on your PC or home server. It’s designed to enhance your Roblox experience by:

- Giving you a fast, local way to view Roblox data
- Allowing full customization of the UI and functionality
- Removing the need for bloated browser extensions

---

## What are the features Netro has?

- Friend History (Allows you to see your full friend history, tracks when you become friends with someone for lost friendship with a user)
- Last Online (Tracks when your friends were last online, Requires your friend to have their "Online status" set to friends+)
- Best Friends (Allows you to mark a user as a best friend if you have them added)

## ⚙️ Getting Started

Follow these steps to set up and run Netro:

### 1. Create a `.env` file

In the root directory of the project, create a file named `.env`. This will be used to securely store your `.ROBLOXSECURITY` cookie.

### 2. Add your cookie

Inside the `.env` file, insert the following line:

```env
RBLX_KEY=your_.ROBLOXSECURITY_cookie_here
```

> ⚠️ **Important:** Never share your `.ROBLOXSECURITY` cookie. Keep this file private and secure.

### 3. Install dependencies

Run the following command to install the required Node.js modules:

```bash
npm install express dotenv node-fetch cors node-cache
```

### 4. Start the server

Use the command below to start your local Netro server:

```bash
node server.js
```

---

## 📦 Module Breakdown

| Module        | Purpose                                                                 
|---------------|-------------------------------------------------------------------------
| **express**   | Creates and manages the web server and routes.
| **dotenv**    | Loads environment variables (like your `.ROBLOXSECURITY` cookie) from a `.env` file.
| **node-fetch**| Makes HTTP requests to Roblox's API or other endpoints.
| **cors**      | Enables Cross-Origin Resource Sharing, allowing frontend access from different origins.
| **node-cache**| Caches responses in memory to reduce API load and speed up repeated requests. Also prevents you from getting rate limited by the Roblox API.

---

## 💡 Tips

- For persistent hosting, consider running Netro on a Raspberry Pi or home server.
- You can modify the HTML/CSS to make the UI look exactly how you want.

---

## 📜 License

This project is open-source and maintained by [NovixStuff](https://github.com/NovixStuff). Feel free to contribute, fork, or customize for your personal use.