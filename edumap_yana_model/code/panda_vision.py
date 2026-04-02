import fitz  # PyMuPDF for rendering PDF pages to images
import base64
import os
from openai import OpenAI

os.environ["OPENAI_API_KEY"] = "sk-...(your API key here)..."

class MultimodalPaperAnalyzer:
    def __init__(self, model_name="gpt-4o"):
        """Initialize the analyzer with the specified OpenAI Vision-capable model."""
        self.model_name = model_name
        self.client = OpenAI()

    def _convert_pdf_to_base64_images(self, pdf_path, dpi=150):
        """
        Convert each page of the PDF into a high-res image and encode it as Base64.
        DPI 150 is a sweet spot for balancing text clarity and API token limits.
        """
        print(f"📸 Scanning PDF pages into high-res images: {pdf_path} ...")
        base64_images = []
        try:
            doc = fitz.open(pdf_path)
            for page_num in range(len(doc)):
                page = doc.load_page(page_num)
                # Render the page to an image (Pixmap)
                pix = page.get_pixmap(dpi=dpi)
                # Convert to PNG bytes
                img_bytes = pix.tobytes("png")
                # Encode to Base64 string
                b64_str = base64.b64encode(img_bytes).decode("utf-8")
                base64_images.append(b64_str)
            doc.close()
            print(f"✅ Successfully scanned {len(base64_images)} pages.")
            return base64_images
        except Exception as e:
            print(f"❌ Error rendering PDF: {e}")
            return None

    def analyze_paper_visually(self, pdf_path):
        """Send the images to GPT-4o for multimodal structural extraction."""
        base64_images = self._convert_pdf_to_base64_images(pdf_path)
        
        if not base64_images:
            return "Failed to process PDF images."

        print("🧠 Analyzing page layouts, tables, and charts using GPT-4o Vision...")
        
        # Adaptive Smart Prompt (Upgraded for Vision)
        system_prompt = """
        You are an expert academic research assistant specializing in clinical medicine, bioinformatics, and data science.
        You are analyzing images of a research paper's pages. These pages contain formatted text, complex tables (e.g., patient baselines), charts (e.g., Kaplan-Meier, AUROC/AUPRC curves), and mathematical formulas.
        
        Your task is to extract its core information into a strictly structured Markdown format.
        
        Instructions:
        1. Extract the core "Keywords" (comma-separated).
        2. ADAPT your Level 1 (#) headings based on the paper's actual type:
           - Clinical/Epidemiological: "# 1. Background", "# 2. Study Design & Patient Cohort", "# 3. Clinical Outcomes".
           - Machine Learning/Algorithm: "# 1. Background", "# 2. Dataset & Feature Engineering", "# 3. Model Architecture & Performance".
        3. Use Level 2 (##) headings to break down methodologies.
        4. CRITICAL DATA EXTRACTION (Level 3 '###' headings): 
           - Look closely at the TABLES and CHARTS in the images.
           - Extract exact quantitative metrics: e.g., patient counts, p-values, 95% Confidence Intervals, specific biomarker thresholds, or model evaluation metrics (AUC, Sensitivity, Specificity).
           - Do not summarize vaguely; write down the actual numbers found in the tables or figures.
        """

        # Construct the Multimodal Payload
        # We start with the text instruction
        user_content = [
            {"type": "text", "text": "Please analyze the following paper pages visually and generate the structured Markdown summary:"}
        ]
        
        # Then append each page image to the payload
        for b64 in base64_images:
            user_content.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/png;base64,{b64}",
                    "detail": "high" # Forces the model to look at high-res details for OCR
                }
            })

        try:
            response = self.client.chat.completions.create(
                model=self.model_name,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content}
                ],
                temperature=0.2, 
            )
            return response.choices[0].message.content
            
        except Exception as e:
            return f"API Call Failed: {e}"

# ==========================================
# Execution Block
# ==========================================
if __name__ == "__main__":
    target_pdf = "sepsis_definition.pdf" 
    
    analyzer = MultimodalPaperAnalyzer(model_name="gpt-4o")
    
    if os.path.exists(target_pdf):
        result_md = analyzer.analyze_paper_visually(target_pdf)
        
        output_filename = "vision_analysis_result.md"
        with open(output_filename, "w", encoding="utf-8") as f:
            f.write(result_md)
            
        print(f"\n✅ Analysis complete! Multimodal results saved to {output_filename}")
        print("\n--- Preview ---")
        print(result_md[:500])
    else:
        print(f"❌ Cannot find file: {target_pdf}. Please check the path.")