import logging
from datetime import date as dt_date

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import (
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    ConversationHandler,
    MessageHandler,
    filters,
)

import sheets
from strings import t
from utils.ref_generator import format_ref
from utils.validators import validate_name, validate_phone

logger = logging.getLogger(__name__)

(
    RULES, SERVICE, BARBER, TIME_PREFERENCE,
    NAME, PHONE, CONFIRM, EDIT_MENU, EDIT_FIELD,
) = range(9)

DAY_PREFERENCE = "Day: 10 AM - 6 PM"   # canonical English — used only for sort-key comparison
NIGHT_PREFERENCE = "Night: 6 PM - 12 AM"


def _lang(context) -> str:
    return context.user_data.get("lang", "en")


def _services_keyboard(
    services: list[dict],
    lang: str = "en",
    selected_ids: list | None = None,
) -> InlineKeyboardMarkup:
    if selected_ids is None:
        selected_ids = []
    rows = []
    for service in services:
        name = service.get("name_ar", service["name"]) if lang == "ar" else service["name"]
        prefix = "✅ " if service["service_id"] in selected_ids else ""
        rows.append([InlineKeyboardButton(f"{prefix}{name}", callback_data=f"service_{service['service_id']}")])
    rows.append([InlineKeyboardButton(t("btn_done", lang), callback_data="service_done")])
    return InlineKeyboardMarkup(rows)


def _barbers_keyboard(barbers: list[dict], lang: str = "en") -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [InlineKeyboardButton(
            barber.get("name_ar", barber["name"]) if lang == "ar" else barber["name"],
            callback_data=f"barber_{barber['barber_id']}",
        )]
        for barber in barbers
    ])


def _time_preference_keyboard(lang: str = "en") -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [InlineKeyboardButton(t("time_day_label", lang), callback_data="pref_day")],
        [InlineKeyboardButton(t("time_night_label", lang), callback_data="pref_night")],
    ])


def _edit_menu_keyboard(lang: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [InlineKeyboardButton(t("btn_edit_service", lang), callback_data="edit_service")],
        [InlineKeyboardButton(t("btn_edit_barber", lang), callback_data="edit_barber")],
        [InlineKeyboardButton(t("btn_edit_time_preference", lang), callback_data="edit_time_preference")],
        [InlineKeyboardButton(t("btn_edit_name", lang), callback_data="edit_name")],
        [InlineKeyboardButton(t("btn_edit_phone", lang), callback_data="edit_phone")],
    ])


def _reservation_summary_text(lang: str, data: dict) -> str:
    return t(
        "confirm_summary",
        lang,
        service_name=data["service_name"],
        barber_name=data["barber_name"],
        time_preference=data["time_preference"],
        customer_name=data["customer_name"],
        phone=data["phone"],
    )


def _build_reservation_payload(ref: str, data: dict, created_at: str) -> dict:
    return {
        "booking_ref": ref,
        "service_name": data["service_name"],
        "barber_name": data["barber_name"],
        "time_preference": data["time_preference"],
        "customer_name": data["customer_name"],
        "phone": data["phone"],
        "created_at": created_at,
    }


async def show_rules(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    lang = _lang(context)
    config = sheets.get_config()
    if lang == "ar":
        rules_text = config.get("rules_ar") or config.get("rules", "يرجى الحضور في الموعد المحدد.")
    else:
        rules_text = config.get("rules", "Please arrive on time for your appointment.")
    keyboard = [
        [InlineKeyboardButton(t("rules_agree", lang), callback_data="rules_agree")],
        [InlineKeyboardButton(t("rules_disagree", lang), callback_data="rules_disagree")],
    ]
    await query.message.reply_text(
        t("rules_header", lang, rules=rules_text),
        parse_mode="Markdown",
        reply_markup=InlineKeyboardMarkup(keyboard),
    )
    return RULES


async def handle_rules(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    lang = _lang(context)
    if query.data == "rules_disagree":
        await query.message.reply_text(t("rules_no", lang))
        return ConversationHandler.END
    context.user_data.pop("selected_service_ids", None)
    return await _show_services(update, context)


async def _show_services(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    lang = _lang(context)
    services = sheets.get_available_services()
    if not services:
        await update.effective_message.reply_text(t("no_services", lang))
        context.user_data.pop("editing", None)
        context.user_data.pop("selected_service_ids", None)
        return ConversationHandler.END
    selected_ids = context.user_data.get("selected_service_ids", [])
    await update.effective_message.reply_text(
        t("choose_service", lang),
        reply_markup=_services_keyboard(services, lang, selected_ids),
    )
    return SERVICE


async def handle_service(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    lang = _lang(context)

    if query.data == "service_done":
        selected_ids = context.user_data.get("selected_service_ids", [])
        if not selected_ids:
            await query.answer(t("no_service_selected", lang), show_alert=True)
            return SERVICE
        await query.answer()
        services = sheets.get_available_services()
        service_map = {s["service_id"]: s for s in services}
        sep = "، " if lang == "ar" else ", "
        names = [
            s.get("name_ar", s["name"]) if lang == "ar" else s["name"]
            for sid in selected_ids
            if (s := service_map.get(sid))
        ]
        context.user_data["service_name"] = sep.join(names)
        context.user_data.pop("selected_service_ids", None)
        if context.user_data.pop("editing", False):
            return await _show_confirm(update, context)
        return await _show_barbers(update, context)

    await query.answer()
    service_id = query.data.removeprefix("service_")
    service = sheets.get_service(service_id)
    if service is None:
        await query.message.reply_text(t("service_not_found", lang))
        return await _show_services(update, context)

    selected_ids = context.user_data.setdefault("selected_service_ids", [])
    if service_id in selected_ids:
        selected_ids.remove(service_id)
    else:
        selected_ids.append(service_id)

    services = sheets.get_available_services()
    await query.edit_message_reply_markup(_services_keyboard(services, lang, selected_ids))
    return SERVICE


async def _show_barbers(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    lang = _lang(context)
    barbers = sheets.get_available_barbers()
    if not barbers:
        await update.effective_message.reply_text(t("no_barbers", lang))
        context.user_data.pop("editing", None)
        return ConversationHandler.END
    await update.effective_message.reply_text(
        t("choose_barber", lang),
        reply_markup=_barbers_keyboard(barbers, lang),
    )
    return BARBER


async def handle_barber(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    lang = _lang(context)
    barber_id = query.data.removeprefix("barber_")
    barber = sheets.get_barber(barber_id)
    if barber is None:
        await query.message.reply_text(t("barber_not_found", lang))
        return await _show_barbers(update, context)
    context.user_data["barber_name"] = (
        barber.get("name_ar", barber["name"]) if lang == "ar" else barber["name"]
    )
    if context.user_data.pop("editing", False):
        return await _show_confirm(update, context)
    await query.message.reply_text(
        t("choose_time_preference", lang),
        reply_markup=_time_preference_keyboard(lang),
    )
    return TIME_PREFERENCE


async def handle_time_preference(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    lang = _lang(context)
    context.user_data["time_preference"] = (
        t("time_day_label", lang) if query.data == "pref_day" else t("time_night_label", lang)
    )
    if context.user_data.pop("editing", False):
        return await _show_confirm(update, context)
    await query.message.reply_text(t("name_prompt", lang))
    return NAME


async def handle_name(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    lang = _lang(context)
    result = validate_name(update.message.text)
    if result is None:
        await update.message.reply_text(t("name_error", lang))
        return NAME
    context.user_data["customer_name"] = result
    await update.message.reply_text(t("phone_prompt", lang))
    return PHONE


async def handle_phone(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    lang = _lang(context)
    result = validate_phone(update.message.text)
    if result is None:
        await update.message.reply_text(t("phone_error", lang))
        return PHONE
    context.user_data["phone"] = result
    return await _show_confirm(update, context)


async def _show_confirm(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    lang = _lang(context)
    keyboard = [
        [InlineKeyboardButton(t("btn_agree", lang), callback_data="confirm_agree")],
        [InlineKeyboardButton(t("btn_change", lang), callback_data="confirm_change")],
        [InlineKeyboardButton(t("btn_cancel", lang), callback_data="confirm_cancel")],
    ]
    await update.effective_message.reply_text(
        _reservation_summary_text(lang, context.user_data),
        parse_mode="Markdown",
        reply_markup=InlineKeyboardMarkup(keyboard),
    )
    return CONFIRM


async def handle_confirm(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    lang = _lang(context)
    if query.data == "confirm_cancel":
        await query.message.reply_text(t("booking_cancelled", lang))
        return ConversationHandler.END
    if query.data == "confirm_change":
        return await _show_edit_menu(update, context)

    try:
        cfg = sheets.get_config()
        counter = sheets.increment_booking_counter()
        ref = format_ref(counter)
        reservation_data = _build_reservation_payload(ref, context.user_data, str(dt_date.today()))
        sheets.append_reservation(reservation_data)
    except Exception:
        await query.message.reply_text(t("booking_error", lang))
        return CONFIRM

    d = context.user_data
    host_chat_id = cfg.get("host_chat_id", "")
    if host_chat_id:
        host_msg = (
            "*New Salon Reservation*\n\n"
            f"Ref: {ref}\n"
            f"Service: {d['service_name']}\n"
            f"Barber: {d['barber_name']}\n"
            f"Preferred time: {d['time_preference']}\n"
            f"Customer: {d['customer_name']}\n"
            f"Phone: {d['phone']}"
        )
        try:
            await context.bot.send_message(int(host_chat_id), text=host_msg)
        except Exception:
            logger.warning("Failed to send host notification for booking %s", ref, exc_info=True)

    host_phone = cfg.get("host_phone", "")
    try:
        await query.message.reply_text(
            t("booking_confirmed", lang, ref=ref, host_phone=host_phone),
            parse_mode="Markdown",
        )
    except Exception:
        logger.warning("Failed to send customer confirmation for booking %s", ref, exc_info=True)
    return ConversationHandler.END


async def _show_edit_menu(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    lang = _lang(context)
    await update.callback_query.message.reply_text(
        t("edit_prompt", lang),
        reply_markup=_edit_menu_keyboard(lang),
    )
    return EDIT_MENU


async def handle_edit_menu(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    target = query.data.removeprefix("edit_")

    lang = _lang(context)
    if target == "service":
        context.user_data.pop("selected_service_ids", None)
        context.user_data["editing"] = True
        return await _show_services(update, context)
    if target == "barber":
        context.user_data["editing"] = True
        return await _show_barbers(update, context)
    if target == "time_preference":
        context.user_data["editing"] = True
        await query.message.reply_text(
            t("choose_time_preference", lang),
            reply_markup=_time_preference_keyboard(lang),
        )
        return TIME_PREFERENCE

    prompts = {
        "name": t("name_new_prompt", lang),
        "phone": t("phone_new_prompt", lang),
    }
    context.user_data["edit_target"] = target
    await query.message.reply_text(prompts[target])
    return EDIT_FIELD


async def handle_edit_field(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    target = context.user_data["edit_target"]
    lang = _lang(context)
    text = update.message.text
    validators = {"name": validate_name, "phone": validate_phone}
    errors = {
        "name": t("name_error", lang),
        "phone": t("phone_error", lang),
    }
    keys = {"name": "customer_name", "phone": "phone"}

    result = validators[target](text)
    if result is None:
        await update.message.reply_text(errors[target])
        return EDIT_FIELD
    context.user_data[keys[target]] = result
    context.user_data.pop("edit_target", None)
    return await _show_confirm(update, context)


async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    lang = _lang(context)
    await update.effective_message.reply_text(t("cancelled", lang))
    return ConversationHandler.END


def build_booking_handler() -> ConversationHandler:
    return ConversationHandler(
        entry_points=[CallbackQueryHandler(show_rules, pattern="^new_booking$")],
        states={
            RULES: [
                CallbackQueryHandler(handle_rules, pattern="^rules_(agree|disagree)$"),
            ],
            SERVICE: [
                CallbackQueryHandler(handle_service, pattern=r"^service_"),
            ],
            BARBER: [
                CallbackQueryHandler(handle_barber, pattern=r"^barber_"),
            ],
            TIME_PREFERENCE: [
                CallbackQueryHandler(handle_time_preference, pattern=r"^pref_(day|night)$"),
            ],
            NAME: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, handle_name),
            ],
            PHONE: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, handle_phone),
            ],
            CONFIRM: [
                CallbackQueryHandler(handle_confirm, pattern=r"^confirm_(agree|change|cancel)$"),
            ],
            EDIT_MENU: [
                CallbackQueryHandler(
                    handle_edit_menu,
                    pattern=r"^edit_(service|barber|time_preference|name|phone)$",
                ),
            ],
            EDIT_FIELD: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, handle_edit_field),
            ],
        },
        fallbacks=[
            CommandHandler("cancel", cancel),
            CommandHandler("start", cancel),
        ],
        allow_reentry=True,
    )
