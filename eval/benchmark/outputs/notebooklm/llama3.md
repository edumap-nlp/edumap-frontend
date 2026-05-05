# Llama 3 Herd of Models

## General Overview
- Dense Transformer Models
- Parameter Sizes: 8B, 70B, 405B
- 128K Context Window
- Multilingual Support

## Model Architecture
- Standard Transformer
- Grouped Query Attention (GQA)
- 128K Vocabulary Size
- RoPE Base Frequency (500,000)

## Pre-Training Stage

### Data Curation
#### 15.6T Multilingual Tokens
#### Web Data Cleaning & Filtering
#### De-duplication (URL, Doc, Line)
#### Model-based Quality Filtering

### Data Mix
#### 50% General Knowledge
#### 25% Math & Reasoning
#### 17% Code
#### 8% Multilingual

### Training Recipe
#### Initial Pre-training
#### Long Context Pre-training
#### Learning Rate Annealing

## Scaling Laws
- Compute-Optimal Modeling
- IsoFLOPs Curves Analysis
- Predicting Downstream Performance

## Post-Training Stage

### Modeling Strategies
#### Supervised Finetuning (SFT)
#### Rejection Sampling (RS)
#### Direct Preference Optimization (DPO)
#### Model Averaging

### Data Sources
#### Human Preference Data
#### Synthetic Data Generation
#### Topic & Difficulty Scoring

## Infrastructure & Scaling
- 16K H100 GPUs
- 4D Parallelism (TP, CP, PP, DP)
- RoCE Network (NCCLX)
- Tectonic Storage Fabric

## Specific Capabilities
- Code Generation & Debugging
- Multilingual Reasoning
- Math & Step-wise Reasoning
- Tool Use (Search, Python, Wolfram)
- Steerability & Persona

## Evaluation Results
- Benchmark Comparisons (MMLU, HumanEval)
- Human Evaluations
- Proficiency Exams (SAT, GRE, AP)
- Safety & Harmlessness
