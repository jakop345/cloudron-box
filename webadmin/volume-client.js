"use strict";

function auth(username, password) {
    return 'Basic ' + $.base64.encode(username + ':' + password);
}

function createVolume(event) {
    event.preventDefault();

    var form = $(this);

    var requestBody = {
        name: form.find("input[name='name']").val()
    };

    if (!requestBody.name) {
        console.error("Create Volume", "Volume name is empty.");
        $("#new-volume-dialog-form").addClass("has-error");
        return;
    }

    $("#new-volume-dialog-form").removeClass("has-error");
    $("#new-volume-dialog").modal("hide");
    showModalDialog("Create Volume", "Hold on...", { indeterminate: true });

    $.ajax({
        type: "POST",
        url: form.attr("action"),
        beforeSend: function (xhr) {
            var username = window.yellowtent.username;
            var password = form.find("input[name='password']").val();
            xhr.setRequestHeader('Authorization', auth(username, password));
        },
        data: requestBody,
        success: function (data) {
            hideModalDialog();
            getVolumeListing();
        },
        error: function (error) {
            var msg = 'Failed.';

            try {
                msg = JSON.parse(error.responseText).message;
            } catch (e) {}

            showModalDialog('Create Volume', msg);
        }
    });
}

function deleteVolume(volumeId) {
    var requestBody = {};

    showModalDialog("Deleting Volume", "Hold on...", { indeterminate: true });

    $.ajax({
        type: "POST",
        url: "/api/v1/volume/" + volumeId + "/delete",
        data: requestBody,
        success: function (data) {
            hideModalDialog();
            getVolumeListing();
            clearFileListing();
        },
        error: function () {
            showModalDialog("Deleting Volume", "failed");
        }
    });
}

function createFileListingDelegate(data) {
    var elem = document.createElement("a");
    elem.classList.add("list-group-item");
    elem.innerText = data.filename + (data.isDirectory ? "/" : "");
    elem.href = "#files";
    elem.onclick = function () {
        if (data.isDirectory) {
            getFileListing(data.volume, data.path);
        }
    };

    var badge = document.createElement("span");
    badge.classList.add("badge");
    badge.innerText = printableSize(data.size);

    elem.appendChild(badge);

    return elem;
}

function createVolumeListingDelegate(data) {
    var elem = $('<a href="#files" class="list-group-item">' + data.name + '</a>');
    elem.click(function (event) {
        getFileListing(data.name);
    });

    var btnGroup = $('<div class="btn-group btn-group-xs pull-right"></div>');
    var btn = $('<button class="btn btn-primary btn-xs glyphicon glyphicon-edit"></button>');
    btn.click(function (event) {
        event.stopPropagation();
    });
    btn.appendTo(btnGroup);

    btn = $('<button class="btn btn-danger btn-xs glyphicon glyphicon-trash"></button>');
    btn.click(function (event) {
        event.stopPropagation();
        // TODO let the user confirm ;-)
        deleteVolume(data.name);
    });
    btn.appendTo(btnGroup);

    btnGroup.appendTo(elem);

    return elem[0];
}

function clearVolumeListing() {
    var container = document.getElementById("volume-list-container");
    if (container.firstChild) {
        container.removeChild(container.firstChild);
    }
}

function getVolumeListing() {
    clearVolumeListing();

    $.getJSON("/api/v1/volume/list", function (data) {
        var group = document.createElement("ul");
        group.classList.add("list-group");

        data.forEach(function (e) {
            group.appendChild(createVolumeListingDelegate(e));
        });

        document.getElementById("volume-list-container").appendChild(group);
    }).fail(function (error) {
        console.error("Unable to get volume listing", error);
    });
}

function clearFileListing() {
    var container = document.getElementById("file-list-container");
    if (container.firstChild) {
        container.removeChild(container.firstChild);
    }
}

function getFileListing(volume, folder) {
    volume = volume ? volume : 0;
    folder = folder ? folder : ".";

    clearFileListing();

    $.getJSON("/api/v1/volume/" + volume + "/list/" + folder, function (data) {
        var group = document.createElement("ul");
        group.classList.add("list-group");

        data.forEach(function (e) {
            e.volume = volume;
            group.appendChild(createFileListingDelegate(e));
        });

        document.getElementById("file-list-container").appendChild(group);
    }).fail(function (error) {
        console.error("Unable to get file listing.", error);
    });
}
