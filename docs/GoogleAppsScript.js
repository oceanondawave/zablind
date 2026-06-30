/**
 * Zablind FAQ Google Apps Script Backend
 * 
 * Instructions:
 * 1. Open your Tally Google Sheet.
 * 2. Click "Extensions" > "Apps Script".
 * 3. Delete any code in the editor and paste this code.
 * 4. Go to Project Settings (gear icon) and add these two Script Properties:
 *    - ADMIN_EMAIL: your-google-email@gmail.com
 *    - DRIVE_FOLDER_ID: the folder ID of your Google Drive folder where audio replies will be saved.
 * 5. Click "Deploy" > "New Deployment".
 *    - Select type: "Web app"
 *    - Execute as: "Me"
 *    - Who has access: "Anyone"
 * 6. Copy the Web App URL and paste it into the API_ENDPOINT in your faq.html.
 */

// Define expected column headers in Tally sheet
const COL_NAME = "Họ và tên";
const COL_QUESTION = "Nội dung góp ý / Câu hỏi";
const COL_DATE = "Submitted At";
const COL_REPLY = "Zablind Voice Reply";

function doGet(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    
    // Dynamically locate column indices (0-based)
    var nameIdx = headers.indexOf(COL_NAME);
    if (nameIdx === -1) nameIdx = headers.indexOf("Name");
    if (nameIdx === -1) nameIdx = 2; // default fallback
    
    var questionIdx = headers.indexOf(COL_QUESTION);
    if (questionIdx === -1) questionIdx = headers.indexOf("Câu hỏi / Góp ý");
    if (questionIdx === -1) questionIdx = headers.indexOf("Question");
    if (questionIdx === -1) questionIdx = 3; // default fallback
    
    var dateIdx = headers.indexOf(COL_DATE);
    if (dateIdx === -1) dateIdx = headers.indexOf("Thời gian");
    if (dateIdx === -1) dateIdx = 1; // default fallback
    
    var replyIdx = headers.indexOf(COL_REPLY);
    if (replyIdx === -1) {
      // Create Zablind Voice Reply column header if it doesn't exist
      replyIdx = headers.length;
      sheet.getRange(1, replyIdx + 1).setValue(COL_REPLY);
      SpreadsheetApp.flush();
    }
    
    var submissions = [];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (!row[questionIdx]) continue; // Skip empty rows
      
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
      
      submissions.push({
        rowIndex: i + 1, // 1-based row index for updating/deleting later
        date: dateStr,
        name: row[nameIdx] ? row[nameIdx].toString().trim() : "Người dùng ẩn danh",
        question: row[questionIdx] ? row[questionIdx].toString().trim() : "",
        replyUrl: row[replyIdx] ? row[replyIdx].toString().trim() : ""
      });
    }
    
    // Reverse list to show newest questions first
    submissions.reverse();
    
    return ContentService.createTextOutput(JSON.stringify(submissions))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  // CORS preflight support
  if (e === undefined) {
    return ContentService.createTextOutput("No post data").setMimeType(ContentService.MimeType.TEXT);
  }
  
  try {
    var payload = JSON.parse(e.postData.contents);
    var idToken = payload.idToken;
    var action = payload.action;
    var rowIndex = parseInt(payload.rowIndex);
    
    // 1. Verify Google Sign-in Token
    var email = verifyGoogleToken(idToken);
    if (!email) {
      return makeJsonResponse({ success: false, error: "Unauthorized: Invalid Google login session." });
    }
    
    // 2. Validate Admin Identity
    var adminEmail = PropertiesService.getScriptProperties().getProperty("ADMIN_EMAIL");
    if (!adminEmail || email.toLowerCase().trim() !== adminEmail.toLowerCase().trim()) {
      return makeJsonResponse({ success: false, error: "Forbidden: You are not authorized to answer FAQs." });
    }
    
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var replyIdx = headers.indexOf(COL_REPLY);
    if (replyIdx === -1) {
      return makeJsonResponse({ success: false, error: "Reply column index not found." });
    }
    
    var folderId = PropertiesService.getScriptProperties().getProperty("DRIVE_FOLDER_ID");
    if (!folderId) {
      return makeJsonResponse({ success: false, error: "Drive Folder ID is not configured in settings." });
    }
    var folder = DriveApp.getFolderById(folderId);
    
    // Delete existing file if any before updating or deleting
    var currentReplyUrl = sheet.getRange(rowIndex, replyIdx + 1).getValue();
    if (currentReplyUrl) {
      deleteFileFromDrive(currentReplyUrl);
    }
    
    if (action === "save_reply") {
      var audioBase64 = payload.audioBase64;
      var mimeType = payload.mimeType || "audio/webm";
      var fileName = "reply_row_" + rowIndex + "_" + new Date().getTime() + ".webm";
      
      // Decode Base64 and write file to Drive
      var audioBytes = Utilities.base64Decode(audioBase64);
      var blob = Utilities.newBlob(audioBytes, mimeType, fileName);
      var file = folder.createFile(blob);
      
      // Make file public to allow browser HTML5 playback
      file.setSharing(Drive.Access.ANYONE_WITH_LINK, Drive.Permission.VIEW);
      
      // Construct a direct download link for HTML5 <audio src="..."> element
      var directLink = "https://docs.google.com/uc?export=download&id=" + file.getId();
      
      // Update cell in Sheet
      sheet.getRange(rowIndex, replyIdx + 1).setValue(directLink);
      SpreadsheetApp.flush();
      
      return makeJsonResponse({ success: true, url: directLink });
    } 
    
    else if (action === "delete_reply") {
      // Clear cell in Sheet (Drive deletion was already handled above)
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

function deleteFileFromDrive(url) {
  var match = url.match(/id=([^&]+)/);
  if (match) {
    var fileId = match[1];
    try {
      var file = DriveApp.getFileById(fileId);
      file.setTrashed(true); // Move to trash rather than permanent delete for safety
    } catch (e) {
      console.warn("Could not delete file " + fileId + ": " + e);
    }
  }
}

function makeJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
