"use strict";

import { celestial_config } from "./config.js";
import { catalog as catalogs_data } from "./catalog.js";
import {
    status_is_visible,
    status_hide,
    status_show,
    status_text
} from "./status.js";
import { object_styles } from "./const.js";
import { DsoManager } from "./dso.js";
import { TableManager } from "./tables.js";
import {
    aladin_catalogs_init,
    markers_update,
    aladin_is_visible,
    aladin_show,
    aladin_hide
} from "./sky.js";
import { eq_to_geo, calculate_rise_set } from "./tools.js";
import { draw_day_night_plots, show_visibility_popup } from "./plot.js";

$(document).ready(() => {

    // Define global variables inside the "context" object

    let ctx = {
        // Store username and password in plaintext, these are sent on every API
        // request. If username is null the user is logged out, so the changes
        // made will not be sent to the server, something like an "offline"
        // mode.
        username: null,
        password: null,

        // Reference to the aladin window/applet/library
        aladin: null,

        // DSO manager, keeps track of watchlist and catalogs
        manager: null,
        table_manager: null,

        // List of aladin catalogs (categories of markers, each one with a
        // different shape and color)
        aladin_catalogs: aladin_catalogs_init(),

        // OpenStreetView map
        map : null,

        // For plots. Redrawing the background takes time because we are doing
        // calculations of the sunrise and sunset for every day on the year, so
        // I keep the background and the parameters used to generate it here
        plot_bg: {
            sun_threshold_alt: -10, // Sunrise and sunset happens 10° below the
                                    // horizon
            year: null,
            location: null,
            bg_canvas: null, // Background image of daylight plot
            min_hs: null, // Fractional hours at the top of the plot
            max_hs: null // Fractional hours at the bottom of the plot
        },

        dso_threshold_alt: 15
    };

    // Load JSON data of objects, then start on the main() function

    $.ajax({
        type: "GET",
        url: "/data/dsos.14.json",
        dataType: "json",
    }).done(dsos_data => {

        // DSO manager, keeps track of watchlist and catalogs
        ctx.manager = new DsoManager(dsos_data, catalogs_data);
        ctx.table_manager = new TableManager(
            ctx.manager,
            null, // date
            null, // location
            ctx.dso_threshold_alt,
            ctx.plot_bg,
            dso => server_watchlist_add(ctx, dso.id),
            watch_dso => server_watchlist_delete(ctx, watch_dso),
            watch_dso => server_watchlist_save(ctx, watch_dso),
            dso => ui_aladin_goto(ctx, dso),
            dso => ui_show_plot_popup(ctx, dso),
            (watch_dso, style) => ui_style_change_callback(ctx, watch_dso, style),
            (watch_dso, notes) => ui_notes_change_callback(ctx, watch_dso, notes)
        );

        main(ctx);

    }).fail((xhr, status, error) => {
        console.error("get dsos_data failed", xhr, status, error);

        status_text(`<b>Error ${xhr.status}</b>, are you having connection \
            issues?. Please <b>reload</b> this webpage.`);
        status_show();
    });

    // Init Celestial and Aladin

    Celestial.display(celestial_config);
});

function main(ctx) {

    // Leave space so the banner is not shown above the footer

    let status_banner_height = $("#status-banner").css("height");
    $("body").css("margin-bottom", status_banner_height);

    // Set current time and date of forms

    let now = new Date();
    let day = now.getDate();
    let month = now.getMonth() + 1; // Otherwise returns from 0 to 11
    let year = now.getFullYear();
    let hour = now.getHours();
    let min  = now.getMinutes();

    // Add leading zeroes so each one always has two digits
    month = (month < 10 ? "0" : "") + month;
    day = (day < 10 ? "0" : "") + day;
    hour = (hour < 10 ? "0" : "") + hour;
    min = (min < 10 ? "0" : "") + min;

    $("#datetime-date").val(`${year}-${month}-${day}`);
    $("#datetime-time").val(`${hour}:${min}`);

    ui_celestial_datetime_update(now);
    ui_plot_bg_update(ctx, now, null);
    ctx.table_manager.update_datetime_location(now, null);

    // Status bar

    $("#status-toggle").click(e => {
        if (status_is_visible()) {
            status_hide();
        } else {
            status_show();
        }
    });

    status_hide();

    // Aladin toggle

    $("#aladin-toggle").click(e => {
        if (aladin_is_visible()) {
            aladin_hide();
        } else {
            ui_aladin_load_and_show(ctx);
        }
    });

    // Datetime form

    $("#datetime-form").submit(e => {
        e.preventDefault(); // Disable built-in HTML action
        let [year, month, day] = $("#datetime-date").val().split("-");
        let [hour, min] = $("#datetime-time").val().split(":");
        let date = new Date(year, month - 1, day, hour, min);
        ui_celestial_datetime_update(date);
        ui_plot_bg_update(ctx, date, null);
        ctx.table_manager.update_datetime_location(date, null);
    });

    // Location form

    $("#location-form").submit(e => {
        e.preventDefault(); // Disable built-in HTML action

        let data = {
            lat: parseFloat($("#location-lat").val()),
            lon: parseFloat($("#location-long").val())
        }

        submit_location(data);
    });

    // Location map

    function init_map() {
        let new_map = L.map('leaflet-map');
        // Add OSM tile leayer to the Leaflet map.
        let osmUrl='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
        let osmAttrib='Map data © <a href="https://openstreetmap.org">OpenStreetMap</a> contributors';
        let osm = new L.TileLayer(osmUrl, {attribution: osmAttrib}); // change max zoom TODO

        new_map.setView(new L.LatLng($("#location-lat").val(), $("#location-long").val()),2);
        new_map.addLayer(osm);

        new_map.on('click', e => {
            let lat = e.latlng["lat"];
            let lon = e.latlng["lng"];

            // Leaflet gives longitudes bigger than 180 or smaller than -180 if
            // the user scrolls horizontally
            while (lon < -180) {
                lon += 360;
            }
            while (lon > 180) {
                lon -= 360;
            }

            // Show popup
            let popup = L.popup({ className: ".leaflet-popup-content-wrapper" })
                .setLatLng(e.latlng)
                .setContent(`${lat.toFixed(4)}, ${lon.toFixed(4)} <br> \
                            <input class="leaflet-submit" type="submit" value="Update"></input>`)
                .openOn(new_map);

            // Update location forms and submit to server
            $(".leaflet-submit").click(e => {
                // Copy only 4 decimal places
                $("#location-lat").val(lat.toFixed(4))
                $("#location-long").val(lon.toFixed(4))
                submit_location({ lat: lat, lon: lon });
            });
        });

        return new_map;
    }

    let make_toggle = div => {
        let button = div.find(".toggle");
        let collapse = div.find(".collapse");

        button.click(e => {
            if (collapse.css("visibility") == "hidden") {
                collapse.css("visibility", "visible");
                collapse.css("display", "block");
                ctx.map = init_map(ctx);
            } else {
                collapse.css("visibility", "hidden");
                collapse.css("display", "none");
                ctx.map.off()
                ctx.map.remove()
            }
        });
    }
    make_toggle($("#map-wrapper"));

    // Location update

    function submit_location(data) {
        if (logged_in(ctx)) {
            $.ajax({
                type: "PUT",
                url: "/api/v1/location",
                headers: {
                    "Authorization": "Basic "
                        + btoa(ctx.username + ":" + ctx.password)
                },
                data: JSON.stringify(data),
                contentType: "application/json; charset=utf-8",
            }).done(response => {

            }).fail((xhr, status, error) => {
                console.error("location submit to server failed",
                    xhr, status, error);

                status_text(`<b>Error ${xhr.status}</b>, your changes are not \
                    being saved!, reload the page and try again later.`);
                status_show();
            });
        }

        ui_celestial_location_update(data.lat, data.lon);
        ui_plot_bg_update(ctx, null, [data.lat, data.lon]);
        ctx.table_manager.update_datetime_location(null, [data.lat, data.lon]);
    }

    // Login buttons

    $("#login-logout").click(e => {
        // Reloading the page logs out
        window.location.reload(false); // Reload from cache
    });

    $("#login-form").submit(e => {
        e.preventDefault(); // Disable built-in HTML action

        let username = $("#login-username").val();
        let password = $("#login-password").val();

        $.ajax({
            type: "GET",
            url: "/api/v1/login",
            headers: {
                "Authorization": "Basic " + btoa(username + ":" + password)
            },
        }).done(response => {
            ctx.username = username;
            ctx.password = password;

            server_watchlist_get(ctx);
            server_location_get(ctx);

            $("#login-form, #register-link").css({
                "display": "none",
                "visibility": "hidden"
            });
            $("#login-welcome, #login-logout, #change-password-link").css({
                "display": "inherit",
                "visibility": "visible"
            });
            $("#login-welcome").html(`Welcome <b>${username}</b>!`);

            status_text(`Welcome <b>${username}</b>!`);
            status_hide();
        }).fail((xhr, status, error) => {
            console.error("login form submit failed", xhr, status, error);

            if (xhr.status == 401) {
                $("#login-password").val("");
                status_text("<b>Username or password incorrect</b>, try again.");
                status_show();
            } else {
                status_text(`<b>Error ${xhr.status}</b>, try again later.`);
                status_show();
            }
        });
    });
}


/**
 * Return true if we are logged in
 */
function logged_in(ctx) {
    return ctx.username != null;
}

/**
 * Load aladin if necessary and show it
 *
 * I use this to do late loading of the aladin applet
 */
function ui_aladin_load_and_show(ctx) {
    if (ctx.aladin == null) {
        ctx.aladin = A.aladin("#aladin-map", {
            fov: 1,
            target: "M81", // TODO replace with coordinates so we dont use a request
            reticleColor: "rgb(0, 0, 0)", // Used on coordinates text
            showReticle: false,
        });

        markers_update(ctx.manager, ctx.aladin, ctx.aladin_catalogs);
    }

    aladin_show();
}

/**
 * Show given dso on the aladin map
 */
function ui_aladin_goto(ctx, dso) {

    let geo_coords = eq_to_geo(dso.coords)
    ui_aladin_load_and_show(ctx);
    ctx.aladin.gotoRaDec(
        geo_coords[0],
        geo_coords[1],
    );

    // Set FOV to the biggest of width,height of object, convert dimensions from
    // arcminutes to degrees. Also set minimum to 3 arcminutes.
    let dim = dso.dimensions;
    ctx.aladin.setFov(Math.max(dim[0], dim[1], 3) / 60);

    // Scroll page to map
    window.location.hash = "sky-surveys";
}

/**
 * Show given dso on the visibility plot
 */
function ui_show_plot_popup(ctx, dso) {

    if (ctx.plot_bg.bg_canvas == null) {
        console.error("User clicked on plot before selecting location");

        status_text(`<b>Error</b>, select a location first`);
        status_show();
    } else {
        show_visibility_popup(
            ctx.plot_bg.bg_canvas,
            dso,
            ctx.plot_bg.location,
            ctx.dso_threshold_alt,
            ctx.plot_bg.sun_threshold_alt,
            ctx.plot_bg.year,
            ctx.plot_bg.min_hs,
            ctx.plot_bg.max_hs
        );
    }
}

/**
 * Set the observing time for the Celestial map
 */
function ui_celestial_datetime_update(datetime) {
    Celestial.skyview({date: datetime});
}

/**
 * Redraw the daylight plot if neccesary
 *
 * If unchanged, datetime and location arguments can be null. But if the plot was
 * never drawn before, both arguments must be valid, otherwise nothing will
 * happen
 */
function ui_plot_bg_update(ctx, datetime, location) {
    let redraw = false;

    if (ctx.plot_bg.bg_canvas == null) {
        redraw = true;
    }

    if (datetime != null && ctx.plot_bg.year != datetime.getYear()) {
        ctx.plot_bg.year = datetime.getFullYear();
        redraw = true;
    }

    if (location != null && ctx.plot_bg.location != location) {
        ctx.plot_bg.location = location;
        redraw = true;
    }


    if (redraw && ctx.plot_bg.year != null && ctx.plot_bg.location != null) {
        let result = draw_day_night_plots(
            ctx.plot_bg.location,
            [800, 500],
            ctx.plot_bg.sun_threshold_alt,
            ctx.plot_bg.year
        );
        ctx.plot_bg.bg_canvas = result[0];
        ctx.plot_bg.min_hs = result[1];
        ctx.plot_bg.max_hs = result[2];
    }
}

/**
 * Set the observing location for the Celestial map
 */
function ui_celestial_location_update(lat, long) {
    Celestial.skyview({location: [lat, long]});
    $("#location-warning").css("display", "none");
    $("#location-warning").css("visibility", "hidden");
}

/**
 * This function should be called when the style of an object changes on the UI
 */
function ui_style_change_callback(ctx, watch_dso, style_id) {

    ctx.table_manager.watchlist_set_unsaved(watch_dso);

    // Update the watchlist object
    watch_dso.style = style_id;

    // Update the map
    markers_update(ctx.manager, ctx.aladin, ctx.aladin_catalogs);
}

/**
 * This function should be called when the notes of an object changes on the UI
 */
function ui_notes_change_callback(ctx, watch_dso, notes) {

    ctx.table_manager.watchlist_set_unsaved(watch_dso);

    // Update the watchlist object
    watch_dso.notes = notes;
}

/**
 * Get location from server and update the user interface accordingly
 */
function server_location_get(ctx) {
    $.ajax({
        type: "GET",
        url: "/api/v1/location",
        headers: {
            "Authorization": "Basic " + btoa(ctx.username + ":" + ctx.password)
        },
        dataType: "json",
    }).done(json => {

        $("#location-lat").val(`${json.lat}`);
        $("#location-long").val(`${json.lon}`);
        ui_celestial_location_update(json.lat, json.lon);
        ui_plot_bg_update(ctx, null, [json.lat, json.lon]);
        ctx.table_manager.update_datetime_location(null, [json.lat, json.lon]);

    }).fail((xhr, status, error) => {
        console.error("server_location_get() failed", xhr, status, error);

        status_text(`<b>Error ${xhr.status}</b>, your changes are not being \
            saved!, reload the page and try again later.`);
        status_show();
    });

}

/**
 * Load watchlist from server
 */
function server_watchlist_get(ctx) {
    $.ajax({
        type: "GET",
        url: "/api/v1/watchlist",
        headers: {
            "Authorization": "Basic " + btoa(ctx.username + ":" + ctx.password)
        },
        dataType: "json",
    }).done(json => {

        // Check the API, the field is named star_id instead of just id
        for (let obj of json) {
            let watch_dso = ctx.manager.watchlist_add(obj.star_id, obj.notes, obj.style);
        }

        ctx.table_manager.watchlist_update();

        markers_update(ctx.manager, ctx.aladin, ctx.aladin_catalogs);

    }).fail((xhr, status, error) => {
        console.error("server_watchlist_get() failed", xhr, status, error);

        status_text(`<b>Error ${xhr.status}</b>, your changes are not being \
            saved!, reload the page and try again later.`);
        status_show();
    });
}


/**
 * Delete object from watchlist, both on server and on client
 */
function server_watchlist_delete(ctx, watch_dso) {

    ctx.manager.watchlist_remove(watch_dso);
    ctx.table_manager.watchlist_remove(watch_dso);

    if (logged_in(ctx)) {
        $.ajax({
            type: "DELETE",
            url: `/api/v1/watchlist/${watch_dso.dso.id}`,
            headers: {
                "Authorization": "Basic "
                    + btoa(ctx.username + ":" + ctx.password)
            },
        }).done(response => {

        }).fail((xhr, status, error) => {
            console.error("server_watchlist_delete() failed", xhr, status, error);

            status_text(`<b>Error ${xhr.status}</b>, your changes are not \
                being saved!, reload the page and try again later.`);
            status_show();
        });
    }

    markers_update(ctx.manager, ctx.aladin, ctx.aladin_catalogs);
}

/**
 * Add object to watchlist, both on client and on server
 */
function server_watchlist_add(ctx, id) {

    let watch_dso = ctx.manager.watchlist_add(id, null, null);
    ctx.table_manager.watchlist_add(watch_dso);

    if (watch_dso == null) { // Object already in watchlist
        return;
    }

    if (logged_in(ctx)) {
        $.ajax({
            type: "POST",
            url: "/api/v1/watchlist",
            headers: {
                "Authorization": "Basic "
                    + btoa(ctx.username + ":" + ctx.password)
            },
            contentType: "application/json; charset=utf-8",
            data: JSON.stringify({
                star_id: watch_dso.dso.id,
                notes: watch_dso.notes,
                style: watch_dso.style,
            }),
        }).done(response => {

        }).fail((xhr, status, error) => {
            console.error("server_watchlist_add() failed", xhr, status, error);

            status_text(`<b>Error ${xhr.status}</b>, your changes are not \
                being saved!, reload the page and try again later.`);
            status_show();
        });
    }

    markers_update(ctx.manager, ctx.aladin, ctx.aladin_catalogs);
}

/**
 * Save changes on given object id to server
 */
function server_watchlist_save(ctx, watch_dso) {

    let tr = watch_dso.get_watchlist_tr();
    let notes = tr.find(".objects-notes textarea").val();
    let style = tr.find(".objects-style select").index();

    if (logged_in(ctx)) {
        $.ajax({
            type: "PUT",
            url: `/api/v1/watchlist/${watch_dso.dso.id}`,
            headers: {
                "Authorization": "Basic "
                    + btoa(ctx.username + ":" + ctx.password)
            },
            contentType: "application/json; charset=utf-8",
            data: JSON.stringify({
                star_id: watch_dso.dso.id,
                notes: notes,
                style: style,
            }),
        }).done(response => {

        }).fail((xhr, status, error) => {
            console.error("server_watchlist_save() failed", xhr, status, error);

            status_text(`<b>Error ${xhr.status}</b>, your changes are not
                being saved!, reload the page and try again later.`);
            status_show();
        });
    }

    ctx.table_manager.watchlist_set_saved(watch_dso);

    markers_update(ctx.manager, ctx.aladin, ctx.aladin_catalogs);
}
