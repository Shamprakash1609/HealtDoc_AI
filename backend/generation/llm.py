from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import StrOutputParser
from backend.config import GOOGLE_API_KEY
from typing import List
from langchain_core.documents import Document

class GenerationService:
    def __init__(self):
        self.llm = ChatGoogleGenerativeAI(model="gemini-flash-latest", google_api_key=GOOGLE_API_KEY, temperature=0.3)
        self.prompt = PromptTemplate(
            template="""You are a helpful and intelligent assistant.
Your goal is to answer the user's question and provide clear explanations using the provided text snippets below.

Guidelines:
1. Provide a detailed, easy-to-understand explanation using the Information from the Context.
2. If the answer is completely missing from the Context, clearly state: "The provided document does not contain information to answer this question."
3. When relevant, elaborate on technical or complex terms found in the Context to ensure the user understands the key concepts.
4. Always cite the Source and Page number that you used to generate the explanation at the end.

Context:
{context}

Question:
{question}

Answer:""",
            input_variables=["context", "question"]
        )

    def format_docs(self, docs: List[Document]) -> str:
        formatted_docs = []
        for doc in docs:
            source = doc.metadata.get("source", "Unknown")
            page = doc.metadata.get("page", "Unknown")
            content = doc.page_content.replace("\n", " ")
            formatted_docs.append(f"Source: {source} (Page {page})\nContent: {content}")
        return "\n\n".join(formatted_docs)

    def generate_answer(self, query: str, context_docs: List[Document]) -> str:
        """Generates an answer based on query and context."""
        context_str = self.format_docs(context_docs)
        
        chain = (
            self.prompt
            | self.llm
            | StrOutputParser()
        )
        
        return chain.invoke({"context": context_str, "question": query})
