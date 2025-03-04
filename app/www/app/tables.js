/**
 * DOM tables manager for Watchlist and Catalog
 */

import { object_styles } from "./const.js";
import { format_eq, format_hor } from "./tools.js";
import { draw_visibility_plot } from "./plot.js";

let MAX_ROWS = 100;

/**
 * Takes a sorting function and reverses the result
 *
 * Used as Array.prototype.sort(sort_reverse(f))
 */
function sort_reverse(f) {
    return (a, b) => -f(a, b);
}

/**
 * List of columns on the watchlist, including the string that is shown to the
 * user on the table header
 */
const watchlist_columns = [
    { name: "name", string: "Name",
        sort: (a, b) => a.dso.name.localeCompare(b.dso.name, undefined, { numeric: "true" })
    },
    { name: "mag", string: "Mag",
        sort: (a, b) => a.dso.mag - b.dso.mag
    },
    { name: "type", string: "Type",
        sort: (a, b) => a.dso.type.long_name.localeCompare(b.dso.type.long_name)
    },
    { name: "ra-dec", string: "RA/DEC",
        sort: (a, b) => a.dso.coords[0] - b.dso.coords[0]
    },
    { name: "alt-az", string: "ALT/AZ",
        sort: null // Not implemented
    },
    { name: "style", string: "Style",
        sort: (a, b) => a.style - b.style
    },
    { name: "controls", string: "Controls",
        sort: null // Not implemented
    },
    { name: "notes", string: "Notes",
        sort: (a, b) => a.notes.localeCompare(b.notes)
    },
    { name: "plot", string: "Plot",
        sort: null // Not implemented
    },
];

/**
 * List of columns on the wishlist, including the string that is shown to the
 * user on the table header
 */
const catalog_columns = [
    { name: "name", string: "Name",
        sort: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: "true" })
    },
    { name: "mag", string: "Mag",
        sort: (a, b) => a.mag - b.mag
    },
    { name: "type", string: "Type",
        sort: (a, b) => a.type.long_name.localeCompare(b.type.long_name)
    },
    { name: "ra-dec", string: "RA/DEC",
        sort: (a, b) => a.coords[0] - b.coords[0]
    },
    { name: "alt-az", string: "ALT/AZ",
        sort: null // Not implemented
    },
    { name: "controls", string: "Controls",
        sort: null // Not implemented
    },
    { name: "appears_on", string: "Appears on",
        sort: (a, b) => -(a.appears_on.length - b.appears_on.length),
    },
    { name: "plot", string: "Plot",
        sort: null // Not implemented
    },
];

/**
 * Manages the Watchlist and Catalog tables
 *
 * - dso_manager: A DsoManager
 * - date: A Date() to use on ALT/AZ calculations
 * - location: latitude and longitude to use on ALT/AZ calculations
 * - dso_threshold_alt: Degrees over the horizon, used on rise and set
 *   calculations
 * - plot_bg: Reference to object with parameters of visibility plot background
 * - add_callback(dso): Called when user clicks the add button, gives dso as
 *   argument
 * - delete_callback(watch_dso): Called when user clicks the delete button,
 *   gives watch_dso as argument
 * - save_callback(watch_dso): Called when user clicks the save button, gives
 *   watch_dso as argument
 * - goto_callback(dso): Called when user clicks the goto button, gives dso as
 *   argument
 * - plot_callback(dso): Called when user clicks the plot canvas, gives dso as
 *   argument
 * - style_change_callback(watch_dso, style): Called when user changes the style
 *   using the dropdown, gives as an argument the watch_dso and the new style
 * - notes_change_callback(watch_dso): Called when user does something on the
 *   notes, gives watch_dso as argument
 */
export function TableManager(
    dso_manager,
    date,
    location,
    dso_threshold_alt,
    plot_bg,
    add_callback,
    delete_callback,
    save_callback,
    goto_callback,
    plot_callback,
    style_change_callback,
    notes_change_callback
) {

    this._date = date;
    this._location = location;
    this._current_catalog_page = 1;
    dso_manager.set_watchlist_change_callback(watchlist_change_callback);

    /**
     * Add object to watchlist table
     */
    this.watchlist_add = function(watch_dso) {
        this._watchlist_update();
    }

    /**
     * Remove object from watchlist table
     */
    this.watchlist_remove = function(watch_dso) {
        this._watchlist_update();
    }

    /**
     * Update plots and ALT/AZ calculations for the catalog and watchlist
     *
     * Give as argument a Date() and [lat, long]. If one of the arguments is
     * null it will keep the previous value
     *
     * Important: The date and location provided is used to update the ALT/AZ
     * calculations, but plots use the date and location available on the
     * plot_bg object, so you should update that object and redraw the
     * plot_bg.bg_canvas before calling this function
     */
    this.update_datetime_location = function(date, location) {
        if (date != null) {
            this._date = date;
        }
        if (location != null) {
            this._location = location;
        }

        this._watchlist_update();
        this._catalog_update();
    }

    /**
     * Mark object as unsaved, e.g. enable save button
     */
    this.watchlist_set_unsaved = function(watch_dso) {
        // Enable the save button
        let tr = watch_dso.get_watchlist_tr();
        tr.find(".objects-save").prop("disabled", false);
    }

    /**
     * Mark object as saved, e.g. disable save button
     */
    this.watchlist_set_saved = function(watch_dso) {
        // Disable the save button
        let tr = watch_dso.get_watchlist_tr();
        tr.find(".objects-save").prop("disabled", true);
    }

    /**
     * Clear and reload the watchlist table
     *
     * Update completely from the DsoManager list.
     *
     * Does not read the filters form, so it will use the previous filters
     */
    this._watchlist_update = function() {

        let watchlist_view = dso_manager.get_watchlist_view();

        let tbody = $("#watchlist-table tbody");
        tbody.empty();

        if (watchlist_view.length == 0) {
            $("#watchlist-no-results").css("display", "inherit");
            $("#watchlist-table").css("display", "none");
        } else {
            $("#watchlist-no-results").css("display", "none");
            $("#watchlist-table").css("display", "inherit");
        }

        for (let watch_dso of watchlist_view) {

            let plot_canvas = $("<canvas>", { class: "small-visibility-plot" })[0];
            let tr = watchlist_create_row(
                watch_dso,
                this._date,
                this._location,
                plot_canvas,
                delete_callback,
                save_callback,
                goto_callback,
                plot_callback,
                style_change_callback,
                notes_change_callback
            );

            watch_dso.set_watchlist_tr(tr);
            tbody.append(tr);

            if (plot_bg.bg_canvas != null) {
                draw_visibility_plot(
                    plot_canvas,
                    plot_bg.bg_canvas,
                    watch_dso.dso,
                    plot_bg.location,
                    dso_threshold_alt,
                    plot_bg.year,
                    plot_bg.min_hs,
                    plot_bg.max_hs
                );
            }
        }
    }

    this.watchlist_update = this._watchlist_update;

    /**
     * Clear and reload the catalog table on a given page
     *
     * Update completely from the DsoManager list.
     *
     * The page shown is given by this._current_catalog_page, checks if the
     * page is valid, otherwise updates the variable and shows the closest one
     *
     *
     * Does not read the filters form, so it will use the previous filters
     */
    this._catalog_update = function() {

        let tbody = $("#catalog-table tbody");
        tbody.empty();
        let catalog_view = dso_manager.get_catalog_view();

        if (catalog_view.length == 0) {
            $("#catalog-no-results").css("display", "inherit");
            $("#catalog-table").css("display", "none");
            $("#catalog-pagination").css("display", "none");
            return;
        } else {
            $("#catalog-no-results").css("display", "none");
            $("#catalog-table").css("display", "inherit");
            $("#catalog-pagination").css("display", "inherit");
        }

        // Pagination calculations

        let pages_total = Math.ceil(catalog_view.length/MAX_ROWS);
        if (this._current_catalog_page < 1) {
            this._current_catalog_page = 1;
        }
        if (this._current_catalog_page > pages_total) {
            this._current_catalog_page = pages_total;
        }
        let page = this._current_catalog_page;

        let start = (page - 1) * MAX_ROWS;
        let end = Math.min(page * MAX_ROWS, catalog_view.length);

        // Update pagination div numbers

        $("#catalog-pagination .table-page").text(`${page}`);
        $("#catalog-pagination .table-pages-total").text(`${pages_total}`);

        $("#catalog-pagination .table-from").text(`${start + 1}`);
        $("#catalog-pagination .table-to").text(`${end}`);
        $("#catalog-pagination .table-total").text(`${catalog_view.length}`);

        // Add rows to table

        for (let i = start; i < end; i++) {
            let dso = catalog_view[i];

            let plot_canvas = $("<canvas>", { class: "small-visibility-plot" })[0];
            let added = dso.on_watchlist;
            let tr = catalog_create_row(
                dso,
                this._date,
                this._location,
                added,
                plot_canvas,
                add_callback,
                goto_callback,
                plot_callback
            );

            dso.set_catalog_tr(tr);
            tbody.append(tr);

            if (plot_bg.bg_canvas != null) {
                draw_visibility_plot(
                    plot_canvas,
                    plot_bg.bg_canvas,
                    dso,
                    plot_bg.location,
                    dso_threshold_alt,
                    plot_bg.year,
                    plot_bg.min_hs,
                    plot_bg.max_hs
                );
            }
        }
    }

    /**
     * Reads the settings selected on the watchlist filters form
     *
     * Does not update the table, so you should update the watchlist table to
     * display the results
     */
    this._read_watchlist_filters = function() {
        let search_string = $("#watchlist-search").val();

        let filtering_search = search_string.length > 0

        dso_manager.watchlist_set_filter(watch_dso => {
            if (filtering_search) {
                return watch_dso.dso.name.toLowerCase().includes(search_string.toLowerCase())
            } else {
                return true
            }
        });
    }

    /**
     * Reads the settings selected on the catalog filters form
     *
     * Does not update the table, so you should update the catalog table to
     * display the results
     */
    this._read_catalog_filters = function() {
        let search_string = $("#catalog-search").val();

        let selected_catalogs = [];
        $("#catalog-select-fieldset input").each(function() {
            if (this.checked) {
                selected_catalogs.push(this.name);
            }
        });

        // True or false if we are filtering or not
        let filtering_catalogs = selected_catalogs.length > 0 && !selected_catalogs.includes("Unlisted");
        let filtering_search = search_string.length > 0

        dso_manager.catalog_set_filter(dso => {
            if (filtering_catalogs) {
                if (!selected_catalogs.some(
                        catalog => dso.appears_on.includes(catalog))) {
                    // The dso does not appear on any of the selected catalogs
                    return false;
                }
            }

            if (filtering_search) {
                if (!dso.name.toLowerCase().includes(search_string.toLowerCase())) {
                    return false;
                }
            }
            return true;
        });
    }

    // Table filters toggle

    let make_toggle = div => {
        let button = div.find(".toggle");
        let collapse = div.find(".collapse");

        button.click(e => {
            if (collapse.css("visibility") == "hidden") {
                collapse.css("visibility", "visible");
                collapse.css("display", "block");
            } else {
                collapse.css("visibility", "hidden");
                collapse.css("display", "none");
            }
        });
    }

    make_toggle($("#watchlist-settings"));
    make_toggle($("#catalog-settings"));

    // Watchlist filters

    $("#watchlist-settings-form").submit(e => {
        e.preventDefault(); // Disable built-in HTML action

        this._read_watchlist_filters();
        this._watchlist_update();
    });

    // Catalog filters

    {
        let fieldset = $("#catalog-select-fieldset");

        let catalogs = [];
        for (let dso of dso_manager.get_catalog()) {
            for (let catalog of dso.appears_on) {
                if (!catalogs.includes(catalog)) {
                    catalogs.push(catalog);
                }
            }
        }
        for (let catalog of catalogs) {
            fieldset.append(
                $("<div>").append(
                    $("<input>", {
                        type: "checkbox",
                        checked: true,
                        name: catalog,
                        id: `catalog-select-${catalog}`
                    }),
                    $("<label>", {
                        for: `catalog-select-${catalog}`,
                        text: `${catalog}`,
                    })
                )
            );
        }
        fieldset.append(
            $("<div>").append(
                $("<input>", {
                    type: "checkbox",
                    checked: false,
                    name: "Unlisted",
                    id: `catalog-select-unlisted`
                }),
                $("<label>", {
                    for: `catalog-select-unlisted`,
                    text: "Unlisted (unpopular DSOs)",
                })
            )
        );
    }

    $("#catalog-settings-form").submit(e => {
        e.preventDefault(); // Disable built-in HTML action

        this._read_catalog_filters();
        this._catalog_update();
    });

    // Table paginations

    $("#watchlist-pagination .table-prev").click(() => {
        this._current_watchlist_page -= 1;
        this._watchlist_update();
    });
    $("#watchlist-pagination .table-next").click(() => {
        this._current_watchlist_page += 1;
        this._watchlist_update();
    });
    $("#catalog-pagination .table-prev").click(() => {
        this._current_catalog_page -= 1;
        this._catalog_update();
    });
    $("#catalog-pagination .table-next").click(() => {
        this._current_catalog_page += 1;
        this._catalog_update();
    });

    // Create table headers and implement sorting

    let tr = $("#watchlist-table thead tr")
    for (let column of watchlist_columns) {
        let th = $("<th>", {
            text: column.string,
        })
        tr.append(th);

        th.click(event => {
            if (column.sort == null) {
                // Column can't be sorted
                return;
            }

            let forward = true;
            if (th.hasClass("sort-forward")) {
                forward = false
            }

            $("#watchlist-table th").removeClass("sort-forward");
            $("#watchlist-table th").removeClass("sort-reverse");
            if (forward) {
                th.addClass("sort-forward");
                dso_manager.watchlist_set_sort(column.sort);
            } else {
                th.addClass("sort-reverse");
                dso_manager.watchlist_set_sort(sort_reverse(column.sort));
            }

            this._watchlist_update();
        });
    }

    tr = $("#catalog-table thead tr")
    for (let column of catalog_columns) {
        let th = $("<th>", {
            text: column.string,
        })
        tr.append(th);

        th.click(event => {
            if (column.sort == null) {
                // Column can't be sorted
                return;
            }

            let forward = true;
            if (th.hasClass("sort-forward")) {
                forward = false
            }

            $("#catalog-table th").removeClass("sort-forward");
            $("#catalog-table th").removeClass("sort-reverse");
            if (forward) {
                th.addClass("sort-forward");
                dso_manager.catalog_set_sort(column.sort);
            } else {
                th.addClass("sort-reverse");
                dso_manager.catalog_set_sort(sort_reverse(column.sort));
            }

            this._catalog_update();
        });

        // Default sort
        if (column.name == "appears_on") {
            th.addClass("sort-forward");
            dso_manager.catalog_set_sort(column.sort);
        }
    }

    // Read the filters because I want to load the default filters (to hide
    // unlisted objects)
    this._read_watchlist_filters();
    this._watchlist_update();
    this._read_catalog_filters();
    this._catalog_update();
}

/**
 * Called when the user adds an object to the watchlist
 *
 * Disables the add button on the catalog for the recently added object
 */
function watchlist_change_callback(watch_dso, added) {
    let tr = watch_dso.dso.get_catalog_tr();
    if (tr != null) {
        tr.find(".objects-add").prop("disabled", added);
    }
}

/**
 * Create table cell with object name
 */
function create_name_cell(name) {
    return $("<td>", {
        class: "objects-name",
    }).append(
        $("<span>", {
            text: name,
        })
    );
}

/**
 * Create table cell with object id
 */
function create_id_cell(id) {
    return $("<td>", {
        class: "objects-id",
    }).append(
        $("<span>", {
            class: "objects-label",
            text: "ID:",
        }),
        $("<span>", {
            text: String(id),
        })
    );
}

/**
 * Create table cell with object magnitude
 */
function create_mag_cell(mag) {
    return $("<td>", {
        class: "objects-mag",
    }).append(
        $("<span>", {
            class: "objects-label",
            text: "Mag:",
        }),
        $("<span>", {
            text: String(mag),
        })
    );
}

/**
 * Create table cell with object type
 */
function create_type_cell(type) {

    return $("<td>", {
        class: "objects-type",
        text: type,
    });
}

/**
 * Create table cell with object RA and DEC as strings
 */
function create_ra_dec_cell(ra_dec) {

    return $("<td>", {
        class: "objects-ra-dec",
    }).append(
        $("<span>").append(
            $("<span>", {
                class: "objects-label",
                text: "RA:",
            }),
            $("<span>", {
                text: ra_dec[0],
            })
        ),
        $("<span>").append(
            $("<span>", {
                class: "objects-label",
                text: "DEC:",
            }),
            $("<span>", {
                text: ra_dec[1],
            })
        )
    );
}

/**
 * Create table cell with visibility plot
 */
function create_plot_cell(canvas, dso, plot_callback) {
    $(canvas).click(() => plot_callback(dso));

    return $("<td>", {
        class: "objects-plot",
    }).append(canvas);
}

/**
 * Create table cell with object ALT and AZ as strings
 */
function create_alt_az_cell(alt_az) {

    return $("<td>", {
        class: "objects-alt-az",
    }).append(
        $("<span>").append(
            $("<span>", {
                class: "objects-label",
                text: "ALT:",
            }),
            $("<span>", {
                text: alt_az[0],
            })
        ),
        $("<span>").append(
            $("<span>", {
                class: "objects-label",
                text: "AZ:",
            }),
            $("<span>", {
                text: alt_az[1],
            })
        )
    );
}

/**
 * Create table cell with object notes
 */
function create_notes_cell(notes, watch_dso, notes_change_callback) {

    return $("<td>", {
        class: "objects-notes",
    }).append(
        $("<textarea placeholder='Notes....'>")
            .val(notes)
            .keyup(() => {
                let tr = watch_dso.get_watchlist_tr();
                notes_change_callback(watch_dso,
                    tr.find(".objects-notes textarea").val());
            })
            .change(() => {
                let tr = watch_dso.get_watchlist_tr();
                notes_change_callback(watch_dso,
                    tr.find(".objects-notes textarea").val());
            })
    );
}


/**
 * Create table cell with style dropdown
 *
 * selected_style must be an integer
 */
function create_style_cell(selected_style, watch_dso, style_change_callback) {
    let td = $("<td>", {
        class: "objects-style",
    });

    /**
     * Get the integer that represents a style by its name
     *
     * If the given name could not be found returns -1
     */
    function get_style_id(style_name) {
        for (let i = 0; i < object_styles.length; i++) {
            if (object_styles[i].name == style_name) {
                return i;
            }
        }
        return -1;
    }

    let select = $("<select>");
    select.change(function() {
        style_change_callback(watch_dso, get_style_id($(this).val()));
    });

    for (let i = 0; i < object_styles.length; i++) {

        if (i == selected_style) {
            select.append(
                $("<option>", {
                    value: object_styles[i].name,
                    text: object_styles[i].string,
                    selected: true,
                })
            );
        } else {
            select.append(
                $("<option>", {
                    value: object_styles[i].name,
                    text: object_styles[i].string,
                })
            );
        }
    }

    td.append(select);

    return td;
}

/**
 * Create watchlist table row
 *
 * Args:
 * - watch_dso: WatchDso object
 * - date: A Date() to use on ALT/AZ calculations
 * - location: latitude and longitude to use on ALT/AZ calculations
 * - plot_canvas: canvas of visibilty plot
 * - delete_callback(watch_dso): Called when user clicks the delete button,
 *   gives watch_dso as argument
 * - save_callback(watch_dso): Called when user clicks the save button, gives
 *   watch_dso as argument
 * - goto_callback(dso): Called when user clicks the goto button, gives
 *   dso as argument
 * - plot_callback(dso): Called when user clicks the plot canvas, gives
 *   dso as argument
 * - style_change_callback(watch_dso, style): Called when user changes the style
 *   using the dropdown, gives as an argument the watch_dso and the new style
 * - notes_change_callback(watch_dso): Called when user does something on the
 *   notes, gives watch_dso as argument
 */
function watchlist_create_row(
    watch_dso,
    date,
    location,
    plot_canvas,
    delete_callback,
    save_callback,
    goto_callback,
    plot_callback,
    style_change_callback,
    notes_change_callback
) {
    let tr =  $("<tr>");
    for (let col of watchlist_columns) {
        switch (col.name) {
            case "id":
                tr.append(create_id_cell(watch_dso.dso.id));
                break;

            case "name":
                tr.append(create_name_cell(watch_dso.dso.name));
                break;

            case "mag":
                tr.append(create_mag_cell(watch_dso.dso.mag));
                break;

            case "type":
                tr.append(create_type_cell(watch_dso.dso.type.long_name));
                break;

            case "ra-dec":
                tr.append(create_ra_dec_cell(format_eq(watch_dso.dso.coords)));
                break;

            case "alt-az":
                if (date != null && location != null) {
                    tr.append(create_alt_az_cell(
                        format_hor(watch_dso.dso.get_alt_az(date, location))
                    ));
                } else {
                    tr.append(create_alt_az_cell(["-", "-"]))
                }
                break;

            case "plot":
                tr.append(create_plot_cell(plot_canvas, watch_dso.dso, plot_callback));
                break;

            case "notes":
                tr.append(create_notes_cell(watch_dso.notes, watch_dso, notes_change_callback));
                break;

            case "style":
                tr.append(create_style_cell(watch_dso.style, watch_dso, style_change_callback));
                break;

            case "controls":
                tr.append($("<td>", {
                    class: "objects-controls",
                }).append(
                    $("<button>", {
                        text: "X",
                        class: "objects-delete",
                        click: () => delete_callback(watch_dso)
                    }),
                    $("<button>", {
                        text: "Save",
                        disabled: true,
                        class: "objects-save",
                        click: () => save_callback(watch_dso)
                    }),
                    $("<button>", {
                        text: "Survey",
                        class: "objects-goto",
                        click: () => goto_callback(watch_dso.dso)
                    })
                ));
                break;
        }
    }

    return tr;
}

/**
 * Create catalog table row
 *
 * Args:
 * - dso: Dso object
 * - date: A Date() to use on ALT/AZ calculations
 * - location: latitude and longitude to use on ALT/AZ calculations
 * - added: Whether the object is already on the watchlist, in that case the add
 *   button is disabled
 * - plot_canvas: canvas of visibilty plot
 * - add_callback(dso): Called when user clicks the add button, gives dso as
 *   argument
 * - goto_callback(dso): Called when user clicks the goto button, gives dso as
 *   argument
 * - plot_callback(dso): Called when user clicks the plot canvas, gives dso as
 *   argument
 */
function catalog_create_row(
    dso,
    date,
    location,
    added,
    plot_canvas,
    add_callback,
    goto_callback,
    plot_callback
) {
    let tr =  $("<tr>");
    for (let col of catalog_columns) {
        switch (col.name) {
            case "id":
                tr.append(create_id_cell(dso.id));
                break;

            case "name":
                tr.append(create_name_cell(dso.name));
                break;

            case "mag":
                tr.append(create_mag_cell(dso.mag));
                break;

            case "type":
                tr.append(create_type_cell(dso.type.long_name));
                break;

            case "ra-dec":
                tr.append(create_ra_dec_cell(format_eq(dso.coords)));
                break;

            case "alt-az":
                if (date != null && location != null) {
                    tr.append(create_alt_az_cell(
                        format_hor(dso.get_alt_az(date, location))
                    ));
                } else {
                    tr.append(create_alt_az_cell(["-", "-"]))
                }
                break;

            case "plot":
                tr.append(create_plot_cell(plot_canvas, dso, plot_callback));
                break;

            case "controls":
                tr.append($("<td>", {
                    class: "objects-controls",
                }).append(
                    $("<button>", {
                        text: `Add`,
                        disabled: added,
                        class: "objects-add",
                        click: () => add_callback(dso)
                    }),
                    $("<button>", {
                        text: "Survey",
                        class: "objects-goto",
                        click: () => goto_callback(dso)
                    })
                ));
                break;

            case "appears_on":
                let td = $("<td>", {
                    class: "objects-appears-on",
                });
                let ul = $("<ul>");

                for (let catalog of dso.appears_on) {
                    ul.append(
                        $("<li>", { text: catalog, })
                    );
                }

                td.append(ul);
                tr.append(td);
                break;
        }
    }

    return tr;
}
