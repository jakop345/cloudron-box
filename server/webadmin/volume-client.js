"use strict";

function createVolume(event) {
    event.preventDefault();

    var form = $(this);

    var requestBody = {
        name: form.find("input[name='name']").val()
    };

    if (!requestBody.name) {
        showModalDialog("Create Volume", "Volume name is empty.");
        return;
    }

    showModalDialog("Create Volume", "Hold on...", { indeterminate: true });

    $.ajax({
        type: "POST",
        url: form.attr("action"),
        data: requestBody,
        success: function (data) {
            hideModalDialog();
            getVolumeListing();
        },
        error: function () {
            showModalDialog("Create Volume", "failed");
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
    badge.innerText = printableSize(data.stat.size);

    elem.appendChild(badge);

    return elem;
}

function createVolumeListingDelegate(data) {
    var elem = document.createElement("a");
    elem.classList.add("list-group-item");
    elem.innerText = data.name;
    elem.href = "#files";
    elem.onclick = function (event) {
        getFileListing(data.id);
    };

    // TODO replace by glyphicon button?
    var deleteBtn = document.createElement("button");
    deleteBtn.classList.add("btn", "btn-danger", "btn-xs", "pull-right");
    deleteBtn.style.padding = "1px";
    deleteBtn.innerText = "Delete";
    deleteBtn.onclick = function (event) {
        event.stopPropagation();

        deleteVolume(data.id);
    };
    elem.appendChild(deleteBtn);

    return elem;
}

function getVolumeListing() {
    var container = document.getElementById("volume-list-container");
    if (container.firstChild) {
        container.removeChild(container.firstChild);
    }

    $.getJSON("/api/v1/volume/list", function (data) {
        var group = document.createElement("ul");
        group.classList.add("list-group");

        data.forEach(function (e) {
            group.appendChild(createVolumeListingDelegate(e));
        });

        container.appendChild(group);
    }).fail(function (error) {
        console.error("Unable to get volume listing", error);
    });
}

function getFileListing(volume, folder) {
    volume = volume ? volume : 0;
    folder = folder ? folder : ".";

    var container = document.getElementById("file-list-container");
    if (container.firstChild) {
        container.removeChild(container.firstChild);
    }

    $.getJSON("/api/v1/volume/" + volume + "/list/" + folder, function (data) {
        var group = document.createElement("ul");
        group.classList.add("list-group");

        data.forEach(function (e) {
            e.volume = volume;
            group.appendChild(createFileListingDelegate(e));
        });

        container.appendChild(group);
    }).fail(function (error) {
        console.error("Unable to get file listing.", error);
    });
}
