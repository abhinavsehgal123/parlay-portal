const SPREADSHEET_ID = '1ttimHMMywGD-5xc48r6-HWe1QIAosXbudw6JWtfmxEU';
const SUBMISSIONS_SHEET = 'Portal - Submissions';
const MEMBERS_SHEET = 'Portal - Members';

function json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    const expected = PropertiesService.getScriptProperties().getProperty('PORTAL_SECRET');
    if (!expected || body.secret !== expected) return json_({ ok: false, error: 'Unauthorized' });

    const book = SpreadsheetApp.openById(SPREADSHEET_ID);
    const submissionsSheet = book.getSheetByName(SUBMISSIONS_SHEET);

    if (body.action === 'updateSubmission' || body.action === 'deleteSubmission') {
      const id = String(body.id || '').trim();
      if (!id) return json_({ ok: false, error: 'Submission ID required' });
      const ids = submissionsSheet.getRange(2, 1, Math.max(submissionsSheet.getLastRow() - 1, 1), 1).getDisplayValues();
      const index = ids.findIndex(row => row[0] === id);
      if (index === -1) return json_({ ok: false, error: 'Submission not found' });
      const row = index + 2;

      if (body.action === 'deleteSubmission') {
        submissionsSheet.getRange(row, 1, 1, 4).clearContent();
        submissionsSheet.getRange(row, 6, 1, 9).clearContent();
        submissionsSheet.getRange(row, 18).clearContent();
        SpreadsheetApp.flush();
        return json_({ ok: true, id: id, deleted: true, row: row });
      }

      const sport = String(body.sport || '').trim();
      const selection = String(body.selection || '').trim();
      const odds = Number(body.odds);
      if (!sport || !selection || !Number.isFinite(odds)) return json_({ ok: false, error: 'Invalid submission update' });
      submissionsSheet.getRange(row, 6).setValue(sport);
      submissionsSheet.getRange(row, 10).setValue(selection);
      submissionsSheet.getRange(row, 11).setValue(odds);
      SpreadsheetApp.flush();
      return json_({ ok: true, id: id, updated: true, row: row });
    }

    if (body.action === 'updateStatus') {
      const id = String(body.id || '').trim();
      const status = String(body.status || '').trim();
      const allowed = ['Pending', 'Win', 'Loss', 'Push', 'Void'];
      if (!id || !allowed.includes(status)) return json_({ ok: false, error: 'Invalid result update' });

      const ids = submissionsSheet.getRange(2, 1, Math.max(submissionsSheet.getLastRow() - 1, 1), 1).getDisplayValues();
      const index = ids.findIndex(row => row[0] === id);
      if (index === -1) return json_({ ok: false, error: 'Submission not found' });

      const row = index + 2;
      submissionsSheet.getRange(row, 13).setValue(status);
      if (status === 'Pending') submissionsSheet.getRange(row, 14).clearContent();
      else submissionsSheet.getRange(row, 14).setValue(new Date());
      SpreadsheetApp.flush();
      return json_({ ok: true, id: id, status: status, row: row });
    }

    const week = Number(body.week);
    const member = String(body.member || '').trim();
    const sport = String(body.sport || '').trim();
    const selection = String(body.selection || '').trim();
    const odds = Number(body.odds);
    const stake = Number(body.stake || 1);
    if (!Number.isInteger(week) || week < 0 || !member || !sport || !selection || !Number.isFinite(odds)) return json_({ ok: false, error: 'Invalid submission' });

    const membersSheet = book.getSheetByName(MEMBERS_SHEET);
    const memberRows = membersSheet.getRange(2, 1, Math.max(membersSheet.getLastRow() - 1, 1), 3).getValues();
    const memberRow = memberRows.find(row => row[1] === member && row[2] === true);
    if (!memberRow) return json_({ ok: false, error: 'Unknown or inactive member' });

    const existingRows = submissionsSheet.getRange(2, 1, Math.max(submissionsSheet.getLastRow() - 1, 1), 18).getDisplayValues();
    const id = body.id || Utilities.getUuid();
    const sameId = existingRows.findIndex(row => row[0] === id);
    if (sameId !== -1) return json_({ ok: true, id: id, row: sameId + 2, existing: true });

    // D1 is authoritative for weekly limits and duplicate picks. Reuse any stale
    // member/week row so an earlier partial deletion cannot block resubmission.
    const sameMemberWeek = existingRows.findIndex(row => Number(row[2]) === week && row[3] === memberRow[0]);
    const firstBlank = existingRows.findIndex(row => !row[0]);
    const row = sameMemberWeek !== -1 ? sameMemberWeek + 2 : firstBlank === -1 ? submissionsSheet.getMaxRows() + 1 : firstBlank + 2;
    if (row > submissionsSheet.getMaxRows()) submissionsSheet.insertRowsAfter(submissionsSheet.getMaxRows(), 100);
    const now = new Date();
    submissionsSheet.getRange(row, 1, 1, 4).setValues([[id, now, week, memberRow[0]]]);
    submissionsSheet.getRange(row, 6, 1, 9).setValues([[sport, body.league || '', body.event || '', body.market || '', selection, odds, stake, 'Pending', '']]);
    submissionsSheet.getRange(row, 18).setValue(body.notes || 'Portal submission');
    SpreadsheetApp.flush();
    return json_({ ok: true, id: id, row: row });
  } catch (error) {
    return json_({ ok: false, error: String(error && error.message ? error.message : error) });
  }
}
