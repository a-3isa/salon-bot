from functools import wraps
from telegram import Update
from telegram.ext import ContextTypes
import config
import sheets


def admin_only(func):
    @wraps(func)
    async def wrapper(update: Update, context: ContextTypes.DEFAULT_TYPE):
        if update.effective_user.id not in config.ADMIN_IDS:
            return
        return await func(update, context)
    return wrapper


@admin_only
async def add_service(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not context.args:
        await update.message.reply_text("Usage: /add_service <name>")
        return
    name = " ".join(context.args).strip()
    service_id = sheets.add_service(name)
    await update.message.reply_text(f"Service {name} added as `{service_id}`.", parse_mode="Markdown")


@admin_only
async def remove_service(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not context.args:
        await update.message.reply_text("Usage: /remove_service <service_id>")
        return
    service_id = context.args[0].upper()
    try:
        sheets.remove_service(service_id)
        await update.message.reply_text(f"{service_id} removed.")
    except ValueError as e:
        await update.message.reply_text(str(e))


@admin_only
async def set_service_available(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not context.args:
        await update.message.reply_text("Usage: /set_service_available <service_id>")
        return
    service_id = context.args[0].upper()
    try:
        sheets.set_service_availability(service_id, True)
        await update.message.reply_text(f"{service_id} is now available.")
    except ValueError as e:
        await update.message.reply_text(str(e))


@admin_only
async def set_service_unavailable(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not context.args:
        await update.message.reply_text("Usage: /set_service_unavailable <service_id>")
        return
    service_id = context.args[0].upper()
    try:
        sheets.set_service_availability(service_id, False)
        await update.message.reply_text(f"{service_id} is now unavailable.")
    except ValueError as e:
        await update.message.reply_text(str(e))


@admin_only
async def list_services(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    services = sheets.get_available_services()
    if not services:
        await update.message.reply_text("No available services.")
        return
    lines = [f"{s['name']} (`{s['service_id']}`)" for s in services]
    await update.message.reply_text("Available services:\n" + "\n".join(lines), parse_mode="Markdown")


@admin_only
async def add_barber(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not context.args:
        await update.message.reply_text("Usage: /add_barber <name>")
        return
    name = " ".join(context.args).strip()
    barber_id = sheets.add_barber(name)
    await update.message.reply_text(f"Barber {name} added as `{barber_id}`.", parse_mode="Markdown")


@admin_only
async def remove_barber(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not context.args:
        await update.message.reply_text("Usage: /remove_barber <barber_id>")
        return
    barber_id = context.args[0].upper()
    try:
        sheets.remove_barber(barber_id)
        await update.message.reply_text(f"{barber_id} removed.")
    except ValueError as e:
        await update.message.reply_text(str(e))


@admin_only
async def set_barber_available(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not context.args:
        await update.message.reply_text("Usage: /set_barber_available <barber_id>")
        return
    barber_id = context.args[0].upper()
    try:
        sheets.set_barber_availability(barber_id, True)
        await update.message.reply_text(f"{barber_id} is now available.")
    except ValueError as e:
        await update.message.reply_text(str(e))


@admin_only
async def set_barber_unavailable(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not context.args:
        await update.message.reply_text("Usage: /set_barber_unavailable <barber_id>")
        return
    barber_id = context.args[0].upper()
    try:
        sheets.set_barber_availability(barber_id, False)
        await update.message.reply_text(f"{barber_id} is now unavailable.")
    except ValueError as e:
        await update.message.reply_text(str(e))


@admin_only
async def list_barbers(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    barbers = sheets.get_available_barbers()
    if not barbers:
        await update.message.reply_text("No available barbers.")
        return
    lines = [f"{b['name']} (`{b['barber_id']}`)" for b in barbers]
    await update.message.reply_text("Available barbers:\n" + "\n".join(lines), parse_mode="Markdown")
