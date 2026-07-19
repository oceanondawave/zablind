/**
 * Zablind FAQ Google Apps Script Backend (v2.1.2 - Clean Production)
 * 
 * Instructions:
 * 1. Paste this code into your Google Apps Script editor.
 * 2. Configure your constants (DRIVE_FOLDER_ID and ADMIN_EMAIL) at the top of this script.
 * 3. Click "Deploy" > "New Deployment".
 *    - Select type: "Web app"
 *    - Execute as: "Me"
 *    - Who has access: "Anyone"
 * 4. Copy the Web App URL and paste it into the API_ENDPOINT in your faq.html.
 */

// ==========================================
// ⚙️ CẤU HÌNH HỆ THỐNG (ĐIỀN TRỰC TIẾP TẠI ĐÂY)
// ==========================================
const DRIVE_FOLDER_ID = "1tuk9q3C_Aa6-mqUxhu-0G8kyacjkPPz8"; // ID Thư mục Zablind Voice Replies của bạn
const ADMIN_EMAIL = "your-google-email@gmail.com";          // Email đăng nhập trả lời câu hỏi của bạn
// ==========================================

const COL_NAME = "Họ và tên";
const COL_QUESTION = "Nội dung góp ý / Câu hỏi";
const COL_DATE = "Submitted At";
const COL_REPLY = "Zablind Voice Reply";
const COL_STATUS = "Zablind Moderation Status";
const STATUS_ISLAND = "island";

function doGet(e) {
  if (e && e.parameter && e.parameter.action === "get_audio" && e.parameter.fileId) {
    try {
      var file = DriveApp.getFileById(e.parameter.fileId);
      var blob = file.getBlob();
      var bytes = blob.getBytes();
      var base64 = Utilities.base64Encode(bytes);
      var result = {
        success: true,
        mimeType: blob.getContentType(),
        base64: base64
      };
      if (e.parameter.callback) {
        var callback = e.parameter.callback;
        var output = callback + "(" + JSON.stringify(result) + ");";
        return ContentService.createTextOutput(output)
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
      }
      return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      var errResult = { success: false, error: err.toString() };
      if (e.parameter.callback) {
        return ContentService.createTextOutput(e.parameter.callback + "(" + JSON.stringify(errResult) + ");")
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
      }
      return ContentService.createTextOutput(JSON.stringify(errResult))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    
    function normalizeHeader(str) {
      if (!str) return "";
      return str.toString().toLowerCase()
        .replace(/\s+/g, "")
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    }
    
    var nameIdx = -1;
    var questionIdx = -1;
    var dateIdx = -1;
    var replyIdx = -1;
    var statusIdx = -1;
    
    for (var idx = 0; idx < headers.length; idx++) {
      var h = normalizeHeader(headers[idx]);
      if (h.indexOf("tencua") !== -1 || h.indexOf("hovaten") !== -1 || h.indexOf("name") !== -1) {
        nameIdx = idx;
      } else if (h.indexOf("muonhoi") !== -1 || h.indexOf("gopy") !== -1 || h.indexOf("cauhoi") !== -1 || h.indexOf("question") !== -1 || h.indexOf("feedback") !== -1) {
        questionIdx = idx;
      } else if (h.indexOf("submittedat") !== -1 || h.indexOf("thoigian") !== -1 || h.indexOf("date") !== -1 || h.indexOf("timestamp") !== -1) {
        dateIdx = idx;
      } else if (h.indexOf("zablindvoicereply") !== -1 || h.indexOf("reply") !== -1) {
        replyIdx = idx;
      } else if (h.indexOf("zablindmoderationstatus") !== -1 || h.indexOf("moderationstatus") !== -1 || h.indexOf("zablindstatus") !== -1) {
        statusIdx = idx;
      }
    }
    
    if (nameIdx === -1) nameIdx = 3;
    if (questionIdx === -1) questionIdx = 4;
    if (dateIdx === -1) dateIdx = 2;
    if (replyIdx === -1) {
      replyIdx = headers.length;
      sheet.getRange(1, replyIdx + 1).setValue(COL_REPLY);
      headers.push(COL_REPLY);
    }
    if (statusIdx === -1) {
      statusIdx = headers.length;
      sheet.getRange(1, statusIdx + 1).setValue(COL_STATUS);
      SpreadsheetApp.flush();
    }
    
    var activeFileIds = new Set();
    if (DRIVE_FOLDER_ID) {
      try {
        var folder = getAudioFolder(DRIVE_FOLDER_ID);
        var files = folder.getFiles();
        while (files.hasNext()) {
          var file = files.next();
          if (!file.isTrashed()) {
            activeFileIds.add(file.getId());
          }
        }
      } catch (driveErr) {
        console.error("Failed to read Drive folder: " + driveErr);
      }
    }
    
    var submissions = [];
    var sheetUpdated = false;
    
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (!row[questionIdx]) continue;
      
      var dateVal = row[dateIdx];
      var dateStr = "";
      
      if (dateVal instanceof Date) {
        var day = ("0" + dateVal.getDate()).slice(-2);
        var month = ("0" + (dateVal.getMonth() + 1)).slice(-2);
        var year = dateVal.getFullYear();
        var hours = ("0" + dateVal.getHours()).slice(-2);
        var mins = ("0" + dateVal.getMinutes()).slice(-2);
        dateStr = day + "/" + month + "/" + year + " " + hours + ":" + mins;
      } else if (dateVal) {
        dateStr = dateVal.toString();
      } else {
        dateStr = "";
      }
      
      var rawReplyUrl = row[replyIdx] ? row[replyIdx].toString().trim() : "";
      var replyUrl = "";
      if (rawReplyUrl) {
        var fileId = extractFileId(rawReplyUrl);
        if (fileId && activeFileIds.has(fileId)) {
          replyUrl = "https://drive.usercontent.google.com/download?id=" + fileId + "&export=download";
        } else {
          sheet.getRange(i + 1, replyIdx + 1).setValue("");
          sheetUpdated = true;
          replyUrl = "";
        }
      }
      
      submissions.push({
        rowIndex: i + 1,
        date: dateStr,
        name: row[nameIdx] ? row[nameIdx].toString().trim() : "Người dùng ẩn danh",
        question: row[questionIdx] ? row[questionIdx].toString().trim() : "",
        replyUrl: replyUrl,
        status: row[statusIdx] ? row[statusIdx].toString().trim() : ""
      });
    }
    
    if (sheetUpdated) {
      SpreadsheetApp.flush();
    }
    
    submissions.reverse();
    return ContentService.createTextOutput(JSON.stringify(submissions))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  if (e === undefined) {
    return ContentService.createTextOutput("No post data").setMimeType(ContentService.MimeType.TEXT);
  }
  
  try {
    var payload = JSON.parse(e.postData.contents);
    var idToken = payload.idToken;
    var action = payload.action;
    var rowIndex = parseInt(payload.rowIndex);
    
    var email = verifyGoogleToken(idToken);
    if (!email) {
      return makeJsonResponse({ success: false, error: "Unauthorized: Invalid Google login session." });
    }
    
    if (!ADMIN_EMAIL || email.toLowerCase().trim() !== ADMIN_EMAIL.toLowerCase().trim()) {
      return makeJsonResponse({ success: false, error: "Forbidden: You are not authorized to answer FAQs." });
    }

    if (action === "verify_admin") {
      return makeJsonResponse({ success: true, email: email });
    }
    
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var replyIdx = headers.indexOf(COL_REPLY);
    if (replyIdx === -1) {
      replyIdx = headers.length;
      sheet.getRange(1, replyIdx + 1).setValue(COL_REPLY);
      headers.push(COL_REPLY);
    }
    var statusIdx = headers.indexOf(COL_STATUS);
    if (statusIdx === -1) {
      statusIdx = headers.length;
      sheet.getRange(1, statusIdx + 1).setValue(COL_STATUS);
      SpreadsheetApp.flush();
    }

    if (action === "island_question") {
      sheet.getRange(rowIndex, statusIdx + 1).setValue(STATUS_ISLAND);
      SpreadsheetApp.flush();
      return makeJsonResponse({ success: true, status: STATUS_ISLAND });
    }

    if (action === "restore_question") {
      sheet.getRange(rowIndex, statusIdx + 1).setValue("");
      SpreadsheetApp.flush();
      return makeJsonResponse({ success: true, status: "" });
    }

    if (!DRIVE_FOLDER_ID) {
      return makeJsonResponse({ success: false, error: "Drive Folder ID is not configured." });
    }
    var folder = getAudioFolder(DRIVE_FOLDER_ID);
    
    if (action === "save_reply") {
      var currentReplyUrl = sheet.getRange(rowIndex, replyIdx + 1).getValue();
      if (currentReplyUrl) {
        deleteFileFromDrive(currentReplyUrl);
      }

      var audioBase64 = payload.audioBase64;
      var mimeType = payload.mimeType || "audio/webm";
      var ext = "webm";
      if (mimeType.indexOf("mp4") !== -1 || mimeType.indexOf("m4a") !== -1 || mimeType.indexOf("aac") !== -1) {
        ext = "m4a";
      } else if (mimeType.indexOf("ogg") !== -1) {
        ext = "ogg";
      } else if (mimeType.indexOf("wav") !== -1) {
        ext = "wav";
      }
      var fileName = "reply_row_" + rowIndex + "_" + new Date().getTime() + "." + ext;
      
      var audioBytes = Utilities.base64Decode(audioBase64);
      var blob = Utilities.newBlob(audioBytes, mimeType, fileName);
      var file = folder.createFile(blob);
      
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      var directLink = "https://drive.usercontent.google.com/download?id=" + file.getId() + "&export=download";
      
      sheet.getRange(rowIndex, replyIdx + 1).setValue(directLink);
      SpreadsheetApp.flush();
      return makeJsonResponse({ success: true, url: directLink });
    }

    else if (action === "delete_reply") {
      var currentReplyUrl = sheet.getRange(rowIndex, replyIdx + 1).getValue();
      if (currentReplyUrl) {
        deleteFileFromDrive(currentReplyUrl);
      }
      sheet.getRange(rowIndex, replyIdx + 1).setValue("");
      SpreadsheetApp.flush();
      return makeJsonResponse({ success: true });
    } 
    
    else {
      return makeJsonResponse({ success: false, error: "Invalid action." });
    }
    
  } catch (err) {
    return makeJsonResponse({ success: false, error: err.toString() });
  }
}

// Helpers
function verifyGoogleToken(idToken) {
  if (!idToken) return null;
  try {
    var response = UrlFetchApp.fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + idToken, { muteHttpExceptions: true });
    if (response.getResponseCode() === 200) {
      var json = JSON.parse(response.getContentText());
      return json.email;
    }
  } catch (e) {
    console.error("Token verification failed: " + e);
  }
  return null;
}

function extractFileId(url) {
  if (!url) return null;
  var match = url.match(/id=([^&]+)/);
  if (match) return match[1];
  var matchD = url.match(/\/d\/([^/?]+)/);
  if (matchD) return matchD[1];
  return null;
}

function deleteFileFromDrive(url) {
  var fileId = extractFileId(url);
  if (fileId) {
    try {
      var file = DriveApp.getFileById(fileId);
      file.setTrashed(true);
    } catch (e) {
      console.warn("Could not delete file " + fileId + ": " + e);
    }
  }
}

function makeJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getAudioFolder(parentFolderId) {
  var parentFolder = DriveApp.getFolderById(parentFolderId);
  var subFolders = parentFolder.getFoldersByName("audio");
  if (subFolders.hasNext()) {
    return subFolders.next();
  } else {
    var newSubFolder = parentFolder.createFolder("audio");
    newSubFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return newSubFolder;
  }
}
