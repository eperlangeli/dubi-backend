import json
import os
import sys
from datetime import datetime
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATA = ROOT.parent / "DUBI_Ricette_Ufficiali_Data.json"
DEFAULT_OUTPUT = ROOT.parent / "DUBI_Ricette_Fonti_Ufficiali.pdf"


def text(value):
    if value is None:
        return ""
    return str(value).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def meal_label(values):
    labels = {
        "breakfast": "Colazione",
        "lunch": "Pranzo",
        "dinner": "Cena",
        "snack": "Snack",
        "pre_workout": "Pre-workout",
        "post_workout": "Post-workout",
    }
    return ", ".join(labels.get(value, value) for value in values or [])


def diet_bucket(recipe):
    diets = set(recipe.get("dietCompatibility") or [])
    if "vegan" in diets:
        return "Vegano"
    if "vegetarian" in diets:
        return "Vegetariano"
    return "Onnivoro"


def ingredient_line(recipe):
    ingredients = recipe.get("ingredients") or []
    parts = []
    for item in ingredients[:9]:
        name = item.get("name", "")
        quantity = item.get("quantity", "")
        unit = item.get("unit", "g")
        parts.append(f"{name} ({quantity} {unit})")
    return "; ".join(parts)


def audit_label(recipe):
    status = recipe.get("nutritionAuditStatus") or "pending"
    confidence = recipe.get("nutritionConfidenceScore") or 0
    sources = recipe.get("nutritionSourceIds") or []
    source_text = ", ".join(sources) if sources else "fonti non ancora collegate"
    return f"{status} | confidenza {confidence}/100 | {source_text}"


def build_pdf(data_path, output_path):
    payload = json.loads(Path(data_path).read_text(encoding="utf-8-sig"))
    recipes = payload.get("recipes") or []
    source_mode = payload.get("sourceMode", "unknown")
    generated_at = payload.get("generatedAt")

    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=A4,
        rightMargin=1.2 * cm,
        leftMargin=1.2 * cm,
        topMargin=1.2 * cm,
        bottomMargin=1.2 * cm,
        title="DUBI Ricette con Fonti Nutrizionali Ufficiali",
    )

    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="DubiTitle", parent=styles["Title"], fontSize=22, leading=26, spaceAfter=14))
    styles.add(ParagraphStyle(name="DubiSubtitle", parent=styles["Heading2"], fontSize=13, leading=16, textColor=colors.HexColor("#334155")))
    styles.add(ParagraphStyle(name="DubiBody", parent=styles["BodyText"], fontSize=9.2, leading=12))
    styles.add(ParagraphStyle(name="DubiSmall", parent=styles["BodyText"], fontSize=7.4, leading=9.2))
    styles.add(ParagraphStyle(name="DubiSection", parent=styles["Heading1"], fontSize=16, leading=20, spaceBefore=10, spaceAfter=8, textColor=colors.HexColor("#0f766e")))

    story = []
    story.append(Paragraph("DUBI Ricette con Fonti Nutrizionali Ufficiali", styles["DubiTitle"]))
    story.append(Paragraph("Database tecnico per beta: ricette suddivise per stile alimentare, macro, ingredienti, stato audit e fonti.", styles["DubiSubtitle"]))
    story.append(Spacer(1, 0.25 * cm))

    generated_label = generated_at
    try:
        generated_label = datetime.fromisoformat(generated_at.replace("Z", "+00:00")).strftime("%d/%m/%Y %H:%M UTC")
    except Exception:
        pass

    summary = payload.get("summary", {})
    status_summary = ", ".join(f"{key}: {value}" for key, value in (summary.get("auditStatuses") or {}).items())
    story.append(Paragraph(f"<b>Generato:</b> {text(generated_label)}", styles["DubiBody"]))
    story.append(Paragraph(f"<b>Modalita dati:</b> {text(source_mode)}", styles["DubiBody"]))
    story.append(Paragraph(f"<b>Ricette totali:</b> {len(recipes)}", styles["DubiBody"]))
    story.append(Paragraph(f"<b>Stato audit:</b> {text(status_summary or 'non disponibile')}", styles["DubiBody"]))
    story.append(Spacer(1, 0.25 * cm))
    story.append(Paragraph(
        "Nota scientifica: i valori nutrizionali non sono mai assoluti al 100%; variano per materia prima, taglio, cottura, acqua e arrotondamenti. "
        "DUBI usa fonti ufficiali e Atwater factors per ridurre l'errore e segnala la confidenza dell'audit.",
        styles["DubiSmall"],
    ))
    story.append(PageBreak())

    buckets = {"Onnivoro": [], "Vegetariano": [], "Vegano": []}
    for recipe in recipes:
        buckets[diet_bucket(recipe)].append(recipe)

    for section_index, (section, items) in enumerate(buckets.items()):
        if section_index:
            story.append(PageBreak())
        story.append(Paragraph(section, styles["DubiSection"]))
        story.append(Paragraph(f"{len(items)} ricette principali in questa categoria.", styles["DubiBody"]))
        story.append(Spacer(1, 0.2 * cm))

        for recipe in items:
            story.append(Paragraph(text(recipe.get("name", "Ricetta")), styles["DubiSubtitle"]))
            macro_table = Table(
                [[
                    "Pasto",
                    "Kcal",
                    "Proteine",
                    "Carboidrati",
                    "Grassi",
                    "Fibre",
                ], [
                    text(meal_label(recipe.get("mealType"))),
                    str(round(recipe.get("calories", 0))),
                    f"{recipe.get('protein', 0)} g",
                    f"{recipe.get('carbs', 0)} g",
                    f"{recipe.get('fats', 0)} g",
                    f"{recipe.get('fiber', 0)} g",
                ]],
                colWidths=[4.1 * cm, 1.6 * cm, 2.2 * cm, 2.4 * cm, 2.0 * cm, 1.8 * cm],
            )
            macro_table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#ecfdf5")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#064e3b")),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#cbd5e1")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 7.5),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ]))
            story.append(macro_table)
            story.append(Paragraph(f"<b>Ingredienti:</b> {text(ingredient_line(recipe))}", styles["DubiSmall"]))
            story.append(Paragraph(f"<b>Audit nutrizionale:</b> {text(audit_label(recipe))}", styles["DubiSmall"]))
            if recipe.get("scientificSource"):
                story.append(Paragraph(f"<b>Base scientifica:</b> {text(recipe.get('scientificSource'))}", styles["DubiSmall"]))
            story.append(Spacer(1, 0.22 * cm))

    doc.build(story)


def main():
    data_path = Path(os.environ.get("RECIPES_PDF_DATA_PATH") or (sys.argv[1] if len(sys.argv) > 1 else DEFAULT_DATA))
    output_path = Path(os.environ.get("RECIPES_PDF_OUTPUT_PATH") or (sys.argv[2] if len(sys.argv) > 2 else DEFAULT_OUTPUT))
    build_pdf(data_path, output_path)
    print(json.dumps({"outputPath": str(output_path), "dataPath": str(data_path)}, indent=2))


if __name__ == "__main__":
    main()
