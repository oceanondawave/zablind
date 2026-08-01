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
    var params = (e && e.parameter) || {};
    var q = params.q ? parseInt(params.q, 10) : null;
    var limit = Math.max(1, Math.min(parseInt(params.limit, 10) || 10, 50));
    var offset = Math.max(0, parseInt(params.offset, 10) || 0);
    var filter = (params.filter || "all").toString().toLowerCase();
    var search = (params.search || "").toString().toLowerCase().trim();
    var timeFilter = (params.timeFilter || "all").toString().toLowerCase();

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow < 2 || lastCol < 1) {
      return makeJsonResponse({ submissions: [], hasMore: false, nextOffset: offset });
    }

    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

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
      lastCol = Math.max(lastCol, replyIdx + 1);
    }
    if (statusIdx === -1) {
      statusIdx = headers.length;
      sheet.getRange(1, statusIdx + 1).setValue(COL_STATUS);
      headers.push(COL_STATUS);
      lastCol = Math.max(lastCol, statusIdx + 1);
      SpreadsheetApp.flush();
    }

    var activeFileIds = new Set();
    if (DRIVE_FOLDER_ID) {
      try {
        var folder = getAudioFolder(DRIVE_FOLDER_ID);
        var files = folder.getFiles();
        while (files.hasNext()) {
          var driveFile = files.next();
          if (!driveFile.isTrashed()) {
            activeFileIds.add(driveFile.getId());
          }
        }
      } catch (driveErr) {
        console.error("Failed to read Drive folder: " + driveErr);
      }
    }

    var sheetUpdated = false;

    function formatDate(dateVal) {
      if (dateVal instanceof Date) {
        var day = ("0" + dateVal.getDate()).slice(-2);
        var month = ("0" + (dateVal.getMonth() + 1)).slice(-2);
        var year = dateVal.getFullYear();
        var hours = ("0" + dateVal.getHours()).slice(-2);
        var mins = ("0" + dateVal.getMinutes()).slice(-2);
        return day + "/" + month + "/" + year + " " + hours + ":" + mins;
      }
      return dateVal ? dateVal.toString() : "";
    }

    function parseSubmissionDate(dateStr) {
      if (!dateStr) return null;
      var parts = dateStr.split(" ");
      var dateParts = parts[0].split("/");
      if (dateParts.length !== 3) return null;
      var day = parseInt(dateParts[0], 10);
      var month = parseInt(dateParts[1], 10) - 1;
      var year = parseInt(dateParts[2], 10);
      var hours = 0;
      var minutes = 0;
      if (parts[1]) {
        var timeParts = parts[1].split(":");
        hours = parseInt(timeParts[0], 10) || 0;
        minutes = parseInt(timeParts[1], 10) || 0;
      }
      return new Date(year, month, day, hours, minutes);
    }

    function makeSubmission(row, rowIndex) {
      if (!row[questionIdx]) return null;

      var rawReplyUrl = row[replyIdx] ? row[replyIdx].toString().trim() : "";
      var replyUrl = "";
      if (rawReplyUrl) {
        var fileId = extractFileId(rawReplyUrl);
        if (fileId && activeFileIds.has(fileId)) {
          replyUrl = "https://drive.usercontent.google.com/download?id=" + fileId + "&export=download";
        } else {
          sheet.getRange(rowIndex, replyIdx + 1).setValue("");
          sheetUpdated = true;
        }
      }

      return {
        rowIndex: rowIndex,
        date: formatDate(row[dateIdx]),
        name: row[nameIdx] ? row[nameIdx].toString().trim() : "Người dùng ẩn danh",
        question: row[questionIdx] ? row[questionIdx].toString().trim() : "",
        replyUrl: replyUrl,
        status: row[statusIdx] ? row[statusIdx].toString().trim() : ""
      };
    }

    if (q !== null) {
      if (q >= 2 && q <= lastRow) {
        var row = sheet.getRange(q, 1, 1, lastCol).getValues()[0];
        var item = makeSubmission(row, q);
        if (item) {
          if (sheetUpdated) {
            SpreadsheetApp.flush();
          }
          return makeJsonResponse({
            submissions: [item],
            hasMore: false,
            nextOffset: 0
          });
        }
      }
      return makeJsonResponse({ submissions: [], hasMore: false, nextOffset: 0 });
    }

    function matchesTimeFilter(item) {
      if (timeFilter === "all") return true;
      var itemDate = parseSubmissionDate(item.date);
      if (!itemDate) return true;
      var now = new Date();
      if (timeFilter === "today") {
        return itemDate.getDate() === now.getDate() &&
          itemDate.getMonth() === now.getMonth() &&
          itemDate.getFullYear() === now.getFullYear();
      }
      var diffTime = Math.abs(now - itemDate);
      var diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (timeFilter === "week") return diffDays <= 7;
      if (timeFilter === "month") return diffDays <= 30;
      return true;
    }

    function rowMatches(item) {
      var islanded = item.status.toLowerCase() === STATUS_ISLAND;
      if (filter === "island") {
        if (!islanded) return false;
      } else {
        if (islanded) return false;
        if (filter === "answered" && !item.replyUrl) return false;
        if (filter === "unanswered" && item.replyUrl) return false;
      }

      if (!matchesTimeFilter(item)) return false;
      if (search) {
        return item.name.toLowerCase().indexOf(search) !== -1 ||
          item.question.toLowerCase().indexOf(search) !== -1;
      }
      return true;
    }

    var submissions = [];
    var skipped = 0;
    var hasMore = false;
    var rowPointer = lastRow;
    var batchSize = Math.max(limit + offset + 1, 20);

    scanRows:
    while (rowPointer >= 2) {
      var batchStart = Math.max(2, rowPointer - batchSize + 1);
      var batchLength = rowPointer - batchStart + 1;
      var rows = sheet.getRange(batchStart, 1, batchLength, lastCol).getValues();

      for (var r = rows.length - 1; r >= 0; r--) {
        var item = makeSubmission(rows[r], batchStart + r);
        if (!item || !rowMatches(item)) continue;

        if (skipped < offset) {
          skipped++;
          continue;
        }

        if (submissions.length < limit) {
          submissions.push(item);
        } else {
          hasMore = true;
          break scanRows;
        }
      }

      rowPointer = batchStart - 1;
    }

    if (sheetUpdated) {
      SpreadsheetApp.flush();
    }

    return makeJsonResponse({
      submissions: submissions,
      hasMore: hasMore,
      nextOffset: offset + submissions.length
    });

  } catch (err) {
    return makeJsonResponse({ error: err.toString() });
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
