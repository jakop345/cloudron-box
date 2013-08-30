"use strict";

function showModalDialog(header, body, options) {
    options = options || { okButton: true };
    $('#modalDialog .modal-title').text(header);
    $('#modalDialog .modal-body p').text(body);
    if (options.okButton) {
        $('#modalDialog .modal-footer').show();
        $('#modalDialog button.close').show();
        $('#modalDialog .progress').hide();
        $('#modalDialog button#button1').text('OK');
    } else if (options.indeterminate) {
        // FIXME: clicking on the backdrop closes the modal
        $('#modalDialog .modal-footer').hide();
        $('#modalDialog button.close').hide();
        $('#modalDialog .progress').show();
    }
    $('#modalDialog').modal('show');
}

function hideModalDialog() {
    $('#modalDialog').modal('hide');
}

function errorHandler(context) {
    return function (xhr, textStatus, errorThrown) {
        showModalDialog(context, ' status:' + textStatus + ' error:' + errorThrown);
    };
}

// should go into files/utils library
function printableSize(size) {
    var kb = 1024;
    var mb = kb * 1024;
    var gb = mb * 1024;

    if (size < mb) {
        return (size/kb).toPrecision(4) + " KB";
    } else if (size < gb) {
        return (size/mb).toPrecision(4) + " MB";
    } else {
        return (size/gb).toPrecision(4) + " GB";
    }
}