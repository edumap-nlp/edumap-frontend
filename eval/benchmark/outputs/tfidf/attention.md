# Attention

## Wesharethesameweightmatrixbetweenthetwoembeddinglayersand…

### Wesharethesameweightmatrixbetweenthetwoembeddinglayersand…

- 12

Input-Input Layer5
AttentionVisualizations
tI
tI
si
si
ni
ni
siht
siht
tirips
tirips
taht
taht
a
a
ytirojam
ytirojam
fo
fo
naciremA
naciremA
stnemnrevog
stnemnrevog
evah
evah
dessap
dessap
wen
wen
swal
swal
ecnis
ecnis
9002
9002
gnikam
gnikam
eht
eht
noitartsiger
noitartsiger
ro
ro
gnitov
gnitov
ssecorp
ssecorp
erom
erom
tluciffid
tluciffid
.
- Our model achieves 28.4 BLEU on the WMT 2014 English-
to-German translation task, improving over the existing best results, including
ensembles,byover2BLEU.OntheWMT2014English-to-Frenchtranslationtask,
ourmodelestablishesanewsingle-modelstate-of-the-artBLEUscoreof41.8after
trainingfor3.5daysoneightGPUs,asmallfractionofthetrainingcostsofthe
bestmodelsfromtheliterature.
- train PPL BLEU params
N d d h d d P ϵ
model ff k v drop ls steps (dev) (dev) ×106
base 6 512 2048 8 64 64 0.1 0.1 100K 4.92 25.8 65
1 512 512 5.29 24.9
4 128 128 5.00 25.5
(A)
16 32 32 4.91 25.8
32 16 16 5.01 25.4
16 5.16 25.1 58
(B)
32 5.01 25.4 60
2 6.11 23.7 36
4 5.19 25.3 50
8 4.88 25.5 80
(C) 256 32 32 5.75 24.5 28
1024 128 128 4.66 26.0 168
1024 5.12 25.4 53
4096 4.75 26.2 90
0.0 5.77 24.6
0.2 4.95 25.5
(D)
0.0 4.67 25.3
0.2 5.47 25.7
(E) positionalembeddinginsteadofsinusoids 4.92 25.7
big 6 1024 4096 16 0.3 300K 4.33 26.4 213
developmentset,newstest2013.
- [38] Yonghui Wu, Mike Schuster, Zhifeng Chen, Quoc V Le, Mohammad Norouzi, Wolfgang
Macherey,MaximKrikun,YuanCao,QinGao,KlausMacherey,etal.
- [22] Zhouhan Lin, Minwei Feng, Cicero Nogueira dos Santos, Mo Yu, Bing Xiang, Bowen
Zhou, and Yoshua Bengio.

### Arxivpreprintarxiv

- arXivpreprintarXiv:1508.07909,2015.
- arXivpreprintarXiv:1508.04025,2015.
- In
AdvancesinNeuralInformationProcessingSystems,2015.
- arXivpreprintarXiv:1511.06114,2015.

### Usingtheoutputembeddingtoimprovelanguagemodels

- Usingtheoutputembeddingtoimprovelanguagemodels.

### 27 ], However

- Inallbutafewcases[27],however,suchattentionmechanisms
areusedinconjunctionwitharecurrentnetwork.

### Term Memory

- Long short-term memory.

### Miguel Ballesteros

- [8] Chris Dyer, Adhiguna Kuncoro, Miguel Ballesteros, and Noah A. Smith.

## Com Abstract Thedominantsequencetransductionmodelsarebase…

### Com Abstract Thedominantsequencetransductionmodelsarebase…

- ∗Equalcontribution.Listingorderisrandom.JakobproposedreplacingRNNswithself-attentionandstarted
theefforttoevaluatethisidea.Ashish,withIllia,designedandimplementedthefirstTransformermodelsand
hasbeencruciallyinvolvedineveryaspectofthiswork.Noamproposedscaleddot-productattention,multi-head
attentionandtheparameter-freepositionrepresentationandbecametheotherpersoninvolvedinnearlyevery
detail.Nikidesigned,implemented,tunedandevaluatedcountlessmodelvariantsinouroriginalcodebaseand
tensor2tensor.Llionalsoexperimentedwithnovelmodelvariants,wasresponsibleforourinitialcodebase,and
efficientinferenceandvisualizations.LukaszandAidanspentcountlesslongdaysdesigningvariouspartsofand
implementingtensor2tensor,replacingourearliercodebase,greatlyimprovingresultsandmassivelyaccelerating
ourresearch.
- Attention Is All You Need
AshishVaswani∗ NoamShazeer∗ NikiParmar∗ JakobUszkoreit∗
GoogleBrain GoogleBrain GoogleResearch GoogleResearch
avaswani@google.com noam@google.com nikip@google.com usz@google.com
LlionJones∗ AidanN.Gomez∗ † ŁukaszKaiser∗
GoogleResearch UniversityofToronto GoogleBrain
llion@google.com aidan@cs.toronto.edu lukaszkaiser@google.com
IlliaPolosukhin∗ ‡
illia.polosukhin@gmail.com
Abstract
Thedominantsequencetransductionmodelsarebasedoncomplexrecurrentor
convolutionalneuralnetworksthatincludeanencoderandadecoder.
- Wecompute
thematrixofoutputsas:
QKT
Attention(Q,K,V)=softmax( √ )V (1)
d
k
Thetwomostcommonlyusedattentionfunctionsareadditiveattention[2],anddot-product(multi-
plicative)attention.
- Theoutputiscomputedasaweightedsum
3

ScaledDot-ProductAttention Multi-HeadAttention
Figure 2: (left) Scaled Dot-Product Attention.
- dk
3.2.2 Multi-HeadAttention
Insteadofperformingasingleattentionfunctionwithd -dimensionalkeys,valuesandqueries,
model
wefounditbeneficialtolinearlyprojectthequeries,keysandvalueshtimeswithdifferent,learned
linearprojectionstod ,d andd dimensions,respectively.

### Wo 1 H Wherehead

- MultiHead(Q,K,V)=Concat(head ,...,head )WO
1 h
wherehead =Attention(QWQ,KWK,VWV)
i i i i
WheretheprojectionsareparametermatricesWQ ∈Rdmodel×dk,WK ∈Rdmodel×dk,WV ∈Rdmodel×dv
i i i
andWO ∈Rhdv×dmodel.
- In the Transformer this is
reducedtoaconstantnumberofoperations, albeitatthecostofreducedeffectiveresolutiondue
to averaging attention-weighted positions, an effect we counteract with Multi-Head Attention as
describedinsection3.2.
- While single-head
attentionis0.9BLEUworsethanthebestsetting,qualityalsodropsoffwithtoomanyheads.
- (right) Multi-Head Attention consists of several
attentionlayersrunninginparallel.

### 2015 )[ 23

- (2015)[23] multi-task 93.0
Dyeretal.
- Multi-task
sequencetosequencelearning.
- Multi-headattentionallowsthemodeltojointlyattendtoinformationfromdifferentrepresentation
subspacesatdifferentpositions.

### Ndoesnotconnectallpairsofinputandoutput Positions

- Thismakes
it more difficult to learn dependencies between distant positions [12].
- Asingleconvolutionallayerwithkernelwidthk <ndoesnotconnectallpairsofinputandoutput
positions.

## N · D2 ).

### Attentionlayerconnectsallpositionswithaconstantnumberofse…

- Wealsomodifytheself-attention
sub-layer in the decoder stack to prevent positions from attending to subsequent positions.
- AsnotedinTable1,aself-attentionlayerconnectsallpositionswithaconstantnumberofsequentially
executed operations, whereas a recurrent layer requires O(n) sequential operations.
- Inadditiontothetwo
sub-layersineachencoderlayer,thedecoderinsertsathirdsub-layer,whichperformsmulti-head
attentionovertheoutputoftheencoderstack.
- Weemployaresidualconnection[11]aroundeachof
the two sub-layers, followed by layer normalization [1].
- That is, the output of each sub-layer is
LayerNorm(x+Sublayer(x)),whereSublayer(x)isthefunctionimplementedbythesub-layer
itself.

### N · D2 ).

- For translation tasks, the Transformer can be trained significantly faster than architectures based
on recurrent or convolutional layers.
- Tofacilitatetheseresidualconnections,allsub-layersinthemodel,aswellastheembedding
layers,produceoutputsofdimensiond =512.
- 3.3 Position-wiseFeed-ForwardNetworks
Inadditiontoattentionsub-layers,eachofthelayersinourencoderanddecodercontainsafully
connectedfeed-forwardnetwork,whichisappliedtoeachpositionseparatelyandidentically.
- Similartotheencoder,weemployresidualconnections
aroundeachofthesub-layers,followedbylayernormalization.
- Convolutionallayersaregenerallymoreexpensivethan
recurrent layers, by a factor of k. Separable convolutions [6], however, decrease the complexity
considerably, toO(k·n·d+n·d2).

### 6 Identical Layers

- 3.2.3 ApplicationsofAttentioninourModel
TheTransformerusesmulti-headattentioninthreedifferentways:
• In"encoder-decoderattention"layers,thequeriescomefromthepreviousdecoderlayer,
andthememorykeysandvaluescomefromtheoutputoftheencoder.
- 3.1 EncoderandDecoderStacks
Encoder: The encoder is composed of a stack of N = 6 identical layers.

### Experts Layer

- Outrageouslylargeneuralnetworks: Thesparsely-gatedmixture-of-experts
layer.

## Arxiv Preprint Arxiv

### Raykavukcuoglu

- [18] NalKalchbrenner,LasseEspeholt,KarenSimonyan,AaronvandenOord,AlexGraves,andKo-
rayKavukcuoglu.Neuralmachinetranslationinlineartime.arXivpreprintarXiv:1610.10099v2,
2017.
- arXivpreprintarXiv:1705.04304,2017.
- arXivpreprintarXiv:1705.03122v2,2017.
- arXivpreprintarXiv:1701.06538,2017.
- InInternationalConferenceonLearningRepresentations,2017.

### Arxivpreprint Arxiv

- arXiv
preprintarXiv:1610.02357,2016.
- arXivpreprint
arXiv:1609.08144,2016.
- arXivpreprint
arXiv:1607.06450,2016.
- arXiv
preprintarXiv:1608.05859,2016.

### Arxiv Preprint Arxiv

- arXiv preprint
arXiv:1703.03130,2017.
- arXivpreprint
arXiv:1703.10722,2017.
- arXiv preprint
arXiv:1308.0850,2013.

## Standard Wmt 2014 English

### Corr

- CoRR,abs/1703.03906,2017.
- CoRR,abs/1512.00567,2015.
- CoRR,abs/1412.3555,2014.
- CoRR,abs/1409.0473,2014.
- CoRR,abs/1406.1078,2014.

### Pages3104 – 3112

- (2014)[37] WSJonly,discriminative 88.3
Petrovetal.
- JournalofMachine
LearningResearch,15(1):1929–1958,2014.
- InAdvancesinNeuralInformationProcessingSystems,pages3104–3112,2014.

### Standard Wmt 2014 English

- 5.1 TrainingDataandBatching
We trained on the standard WMT 2014 English-German dataset consisting of about 4.5 million
sentencepairs.
- On both WMT 2014 English-to-German and WMT 2014
English-to-Frenchtranslationtasks,weachieveanewstateoftheart.

## Z ,..., Z ),

### Attentive Sentence Embedding

- Self-attentionhasbeen
usedsuccessfullyinavarietyoftasksincludingreadingcomprehension,abstractivesummarization,
textualentailmentandlearningtask-independentsentencerepresentations[4,27,28,22].
- Inthefollowingsections,wewilldescribetheTransformer,motivate
self-attentionanddiscussitsadvantagesovermodelssuchas[17,18]and[9].
- Toimprovecomputationalperformancefortasksinvolving
verylongsequences,self-attentioncouldberestrictedtoconsideringonlyaneighborhoodofsizerin
theinputsequencecenteredaroundtherespectiveoutputposition.
- Assidebenefit,self-attentioncouldyieldmoreinterpretablemodels.Weinspectattentiondistributions
fromourmodelsandpresentanddiscussexamplesintheappendix.
- A structured self-attentive sentence embedding.

### Z ,..., Z ),

- LayerType ComplexityperLayer Sequential MaximumPathLength
Operations
Self-Attention O(n2·d) O(1) O(1)
Recurrent O(n·d2) O(n) O(n)
Convolutional O(k·n·d2) O(1) O(log (n))
k
Self-Attention(restricted) O(r·n·d) O(1) O(n/r)
3.5 PositionalEncoding
Sinceourmodelcontainsnorecurrenceandnoconvolution,inorderforthemodeltomakeuseofthe
orderofthesequence,wemustinjectsomeinformationabouttherelativeorabsolutepositionofthe
tokensinthesequence.
- 4 WhySelf-Attention
In this section we compare various aspects of self-attention layers to the recurrent and convolu-
tionallayerscommonlyusedformappingonevariable-lengthsequenceofsymbolrepresentations
(x ,...,x ) to another sequence of equal length (z ,...,z ), with x ,z ∈ Rd, such as a hidden
1 n 1 n i i
layerinatypicalsequencetransductionencoderordecoder.
- Self-attention,sometimescalledintra-attentionisanattentionmechanismrelatingdifferentpositions
ofasinglesequenceinordertocomputearepresentationofthesequence.

### Attentionlayersarefasterthanrecurrentlayerswhenthesequenc…

- In terms of
computationalcomplexity,self-attentionlayersarefasterthanrecurrentlayerswhenthesequence
6

length n is smaller than the representation dimensionality d, which is most often the case with
sentencerepresentationsusedbystate-of-the-artmodelsinmachinetranslations,suchasword-piece
[38]andbyte-pair[31]representations.

## 5 · 1020 Moe

### 5 · 1020 Moe

- BLEU TrainingCost(FLOPs)
Model
EN-DE EN-FR EN-DE EN-FR
ByteNet[18] 23.75
Deep-Att+PosUnk[39] 39.2 1.0·1020
GNMT+RL[38] 24.6 39.92 2.3·1019 1.4·1020
ConvS2S[9] 25.16 40.46 9.6·1018 1.5·1020
MoE[32] 26.03 40.56 2.0·1019 1.2·1020
Deep-Att+PosUnkEnsemble[39] 40.4 8.0·1020
GNMT+RLEnsemble[38] 26.30 41.16 1.8·1020 1.1·1021
ConvS2SEnsemble[9] 26.36 41.29 7.7·1019 1.2·1021
Transformer(basemodel) 27.3 38.1 3.3·1018
Transformer(big) 28.4 41.8 2.3·1019
ResidualDropout Weapplydropout[33]totheoutputofeachsub-layer,beforeitisaddedtothe
sub-layerinputandnormalized.
- Experiments on two machine translation tasks show these models to
besuperiorinqualitywhilebeingmoreparallelizableandrequiringsignificantly
less time to train.
- Thebest
performing models also connect the encoder and decoder through an attention
mechanism.
- The code we used to train and evaluate our models is available at https://github.com/
tensorflow/tensor2tensor.
- Fast and accurate
shift-reduceconstituentparsing.

### Recurrent Neural Networks

- Generating sequences with recurrent neural networks.
- Recurrent neural
networkgrammars.

### Depthwise Separable Convolutions

- Xception: Deep learning with depthwise separable convolutions.
- Deep residual learning for im-
age recognition.

## Pages770 – 778

### Pages770 – 778

- In Proceedings of the IEEE Conference on Computer Vision and Pattern
Recognition,pages770–778,2016.
- (2016)[8] WSJonly,discriminative 91.7
Transformer(4layers) WSJonly,discriminative 91.3
Zhuetal.
- (2016)[8] generative 93.3
increasedthemaximumoutputlengthtoinputlength+300.
- InInternationalConference
onLearningRepresentations(ICLR),2016.
- InAdvancesinNeural
InformationProcessingSystems,(NIPS),2016.

### Arxivpreprintarxiv

- arXivpreprintarXiv:1602.02410,2016.
- arXivpreprintarXiv:1601.06733,2016.

## K 4 Output Values

### K 4 Output Values

- The dimensionality of input and output is d = 512, and the inner-layer has dimensionality
model
d =2048.
- Numerous
effortshavesincecontinuedtopushtheboundariesofrecurrentlanguagemodelsandencoder-decoder
architectures[38,24,15].
- Given z, the decoder then generates an output
1 n
sequence(y ,...,y )ofsymbolsoneelementatatime.
- model
Decoder: ThedecoderisalsocomposedofastackofN =6identicallayers.
- i=1 i i k
4

output values.

### Z ,..., Z ).

- Thismimicsthe
typical encoder-decoder attention mechanisms in sequence-to-sequence models such as
[38,2,9].
- Here, the encoder maps an input sequence of symbol representations (x ,...,x ) to a sequence
1 n
of continuous representations z = (z ,...,z ).
- Furthermore, RNN sequence-to-sequence
modelshavenotbeenabletoattainstate-of-the-artresultsinsmall-dataregimes[37].

## Vixra 1 Introduction Recurrentneuralnetworks

### Thangluong

- [23] Minh-ThangLuong,QuocV.Le,IlyaSutskever,OriolVinyals,andLukaszKaiser.
- [15] RafalJozefowicz,OriolVinyals,MikeSchuster,NoamShazeer,andYonghuiWu.
- [33] NitishSrivastava,GeoffreyEHinton,AlexKrizhevsky,IlyaSutskever,andRuslanSalakhutdi-
nov.
- [35] IlyaSutskever,OriolVinyals,andQuocVVLe.

### Vixra 1 Introduction Recurrentneuralnetworks

- 3202
guA
2
]LC.sc[
7v26730.6071:viXra

1 Introduction
Recurrentneuralnetworks,longshort-termmemory[13]andgatedrecurrent[7]neuralnetworks
inparticular,havebeenfirmlyestablishedasstateoftheartapproachesinsequencemodelingand
transductionproblemssuchaslanguagemodelingandmachinetranslation[35,2,5].
- 3 ModelArchitecture
Mostcompetitiveneuralsequencetransductionmodelshaveanencoder-decoderstructure[5,2,35].

## 14 Input

### Soe

- >SOE<
>SOE<
>dap<
>dap<
Input-Input Layer5
ehT
ehT
waL
waL
lliw
lliw
reven
reven
eb
eb
tcefrep
tcefrep
,
,
tub
tub
sti
sti
noitacilppa
noitacilppa
dluohs
dluohs
eb
eb
tsuj
tsuj
-
-
siht
siht
si
si
tahw
tahw
ew
ew
era
era
gnissim
gnissim
,
,
ni
ni
ym
ym
noinipo
noinipo
.
- >SOE<
>SOE<
>dap<
>dap<
Input-Input Layer5
ehT
ehT
waL
waL
lliw
lliw
reven
reven
eb
eb
tcefrep
tcefrep
,
,
tub
tub
sti
sti
noitacilppa
noitacilppa
dluohs
dluohs
eb
eb
tsuj
tsuj
-
-
siht
siht
si
si
tahw
tahw
ew
ew
era
era
gnissim
gnissim
,
,
ni
ni
ym
ym
noinipo
noinipo
.

### 14 Input

- 14

Input-Input Layer5
ehT
ehT
waL
waL
lliw
lliw
reven
reven
eb
eb
tcefrep
tcefrep
,
,
tub
tub
sti
sti
noitacilppa
noitacilppa
dluohs
dluohs
eb
eb
tsuj
tsuj
-
-
siht
siht
si
si
tahw
tahw
ew
ew
era
era
gnissim
gnissim
,
,
ni
ni
ym
ym
noinipo
noinipo
.
- 13

Input-Input Layer5
ehT
ehT
waL
waL
lliw
lliw
reven
reven
eb
eb
tcefrep
tcefrep
,
,
tub
tub
sti
sti
noitacilppa
noitacilppa
dluohs
dluohs
eb
eb
tsuj
tsuj
-
-
siht
siht
si
si
tahw
tahw
ew
ew
era
era
gnissim
gnissim
,
,
ni
ni
ym
ym
noinipo
noinipo
.

## Kisthekernel Sizeofconvolutionsandrthesizeoftheneighborho…

### Kisthekernel Sizeofconvolutionsandrthesizeoftheneighborho… — Details

- nisthesequencelength,distherepresentationdimension,kisthekernel
sizeofconvolutionsandrthesizeoftheneighborhoodinrestrictedself-attention.
